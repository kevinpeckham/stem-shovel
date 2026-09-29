import {
	PIANO_MAX_VOICES,
	PIANO_OCTAVE_MAX,
	PIANO_OCTAVE_MIN,
	type PianoInstrumentId,
} from "$lib/constants/piano";
import { HeldNotes } from "$lib/utils/heldNotes";
import { loadPianoPreferences, savePianoPreferences } from "$lib/utils/pianoPreferences";
import { reverbImpulse } from "./drumBus";
import { playThroughSilentSwitch } from "./playThroughSilentSwitch";
import { startVoice, type SynthVoice } from "./synthVoice";

/**
 * The one piano on the page (docs/piano.md): notes come in from the
 * on-screen keys, the computer keyboard or a MIDI controller as MIDI note
 * numbers, and each starts a synthVoice into a master gain with a room
 * behind it (the drum machine's synthesized reverb, small). HeldNotes keeps
 * the pedal's bookkeeping. The AudioContext opens on the first note (a
 * gesture, as browsers require). The choices are remembered per browser.
 */
class PianoEngine {
	instrument = $state<PianoInstrumentId>("epiano");
	/** The octave the on-screen keyboard's lowest C sits in. */
	octave = $state(3);
	volume = $state(0.8);
	reverb = $state(0.25);
	sustain = $state(false);
	/** MIDI notes sounding now, for the keys to light. */
	sounding = $state<number[]>([]);
	/** Web MIDI: not asked yet, asked and refused or absent, or connected with the inputs' names. */
	midi = $state<{ status: "idle" | "unsupported" | "denied" | "on"; inputs: string[] }>({
		status: "idle",
		inputs: [],
	});
	/** The last note a MIDI controller played, so the page can say it is alive. */
	midiActivity = $state(0);

	#ctx: AudioContext | null = null;
	#dry: GainNode | null = null;
	#wet: GainNode | null = null;
	#master: GainNode | null = null;
	#voices = new Map<number, SynthVoice>();
	#order: number[] = [];
	#held = new HeldNotes();
	#loaded = false;
	#access: MIDIAccess | null = null;

	load() {
		if (this.#loaded || typeof window === "undefined") return;
		this.#loaded = true;
		const p = loadPianoPreferences();
		this.instrument = p.instrument;
		this.octave = p.octave;
		this.volume = p.volume;
		this.reverb = p.reverb;
	}
	#save() {
		savePianoPreferences({
			instrument: this.instrument,
			octave: this.octave,
			volume: this.volume,
			reverb: this.reverb,
		});
	}

	#graph(): AudioContext {
		if (this.#ctx) return this.#ctx;
		playThroughSilentSwitch();
		const ctx = new AudioContext();
		const master = ctx.createGain();
		master.gain.value = this.volume;
		master.connect(ctx.destination);
		const dry = ctx.createGain();
		dry.connect(master);
		const convolver = ctx.createConvolver();
		convolver.buffer = reverbImpulse(ctx, 0.35);
		const wet = ctx.createGain();
		wet.gain.value = this.reverb * 0.5;
		dry.connect(convolver);
		convolver.connect(wet);
		wet.connect(master);
		this.#ctx = ctx;
		this.#master = master;
		this.#dry = dry;
		this.#wet = wet;
		return ctx;
	}

	/** The lowest MIDI note of the on-screen keyboard: C of the chosen octave. */
	get base(): number {
		return 12 * (this.octave + 1);
	}

	noteOn(midi: number, velocity = 0.8) {
		if (midi < 0 || midi > 127) return;
		if (!this.#held.on(midi)) return;
		const ctx = this.#graph();
		if (ctx.state !== "running") void ctx.resume();
		const now = ctx.currentTime;
		// Room for one more: the oldest voice goes.
		while (this.#order.length >= PIANO_MAX_VOICES) {
			const oldest = this.#order.shift()!;
			this.#voices.get(oldest)?.release(now);
			this.#voices.delete(oldest);
		}
		this.#voices.set(midi, startVoice(ctx, this.#dry!, this.instrument, midi, velocity, now));
		this.#order.push(midi);
		this.sounding = this.#held.sounding;
	}
	noteOff(midi: number) {
		if (this.#held.off(midi)) this.#stop(midi);
		this.sounding = this.#held.sounding;
	}
	#stop(midi: number) {
		const ctx = this.#ctx;
		const voice = this.#voices.get(midi);
		if (ctx && voice) voice.release(ctx.currentTime);
		this.#voices.delete(midi);
		this.#order = this.#order.filter((n) => n !== midi);
	}
	setSustain(on: boolean) {
		if (this.sustain === on) return;
		this.sustain = on;
		for (const midi of this.#held.setSustain(on)) this.#stop(midi);
		this.sounding = this.#held.sounding;
	}
	/** Everything off: a change of sound, or leaving the page. */
	allOff() {
		for (const midi of this.#held.clear()) this.#stop(midi);
		this.sounding = [];
	}

	setInstrument(id: PianoInstrumentId) {
		if (id === this.instrument) return;
		this.allOff();
		this.instrument = id;
		this.#save();
	}
	setOctave(octave: number) {
		const next = Math.min(PIANO_OCTAVE_MAX, Math.max(PIANO_OCTAVE_MIN, Math.round(octave)));
		if (next === this.octave) return;
		this.allOff();
		this.octave = next;
		this.#save();
	}
	setVolume(v: number) {
		if (!Number.isFinite(v)) return;
		this.volume = Math.min(1, Math.max(0, Math.round(v * 100) / 100));
		if (this.#master) this.#master.gain.value = this.volume;
		this.#save();
	}
	setReverb(v: number) {
		if (!Number.isFinite(v)) return;
		this.reverb = Math.min(1, Math.max(0, Math.round(v * 100) / 100));
		if (this.#wet) this.#wet.gain.value = this.reverb * 0.5;
		this.#save();
	}

	/** Web MIDI (Chrome and Edge): every input plays the piano; note on and off, and the sustain pedal (CC 64). */
	async connectMidi() {
		if (typeof navigator === "undefined" || !("requestMIDIAccess" in navigator)) {
			this.midi = { status: "unsupported", inputs: [] };
			return;
		}
		try {
			const access = await navigator.requestMIDIAccess();
			this.#access = access;
			const listen = () => {
				const names: string[] = [];
				for (const input of access.inputs.values()) {
					names.push(input.name ?? "MIDI input");
					input.onmidimessage = this.#onMidi;
				}
				this.midi = { status: "on", inputs: names };
			};
			access.onstatechange = listen;
			listen();
		} catch {
			this.midi = { status: "denied", inputs: [] };
		}
	}
	#onMidi = (e: MIDIMessageEvent) => {
		const data = e.data;
		if (!data || data.length < 2) return;
		const kind = data[0]! & 0xf0;
		const note = data[1]!;
		const value = data[2] ?? 0;
		if (kind === 0x90 && value > 0) {
			this.noteOn(note, value / 127);
			this.midiActivity = Date.now();
		} else if (kind === 0x80 || (kind === 0x90 && value === 0)) {
			this.noteOff(note);
		} else if (kind === 0xb0 && note === 64) {
			this.setSustain(value >= 64);
		} else if (kind === 0xb0 && (note === 120 || note === 123)) {
			this.allOff();
		}
	};
	disconnectMidi() {
		if (this.#access) for (const input of this.#access.inputs.values()) input.onmidimessage = null;
		this.#access = null;
		this.midi = { status: "idle", inputs: [] };
	}
}

export const piano = new PianoEngine();
