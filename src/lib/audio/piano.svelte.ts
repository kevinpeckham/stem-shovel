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
import {
	loadPianoSamples,
	pianoSamplesFailed,
	pianoSamplesReady,
	startSampledVoice,
	warmPianoSamples,
} from "./pianoSamples";
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
	/** The audio is open and running: the power switch's state. Off until the switch, a touch on the keys or a computer key. */
	on = $state(false);
	/** Between the switch and the audio actually running (a moment on iOS). */
	starting = $state(false);
	/** What the audio context says while starting, for the screen: its state and the seconds since the switch. */
	wake = $state<{ state: string; seconds: number } | null>(null);
	/** The Grand Piano's samples: fetching and decoding, ready, or failed to load (the synths still play). */
	samples = $state<"idle" | "loading" | "ready" | "failed">("idle");

	#ctx: AudioContext | null = null;
	#dry: GainNode | null = null;
	#wet: GainNode | null = null;
	#master: GainNode | null = null;
	#voices = new Map<number, SynthVoice>();
	#order: number[] = [];
	#held = new HeldNotes();
	#loaded = false;
	#access: MIDIAccess | null = null;

	/** Once per page; `warm` fetches the Grand Piano's samples now rather than at the first note (the piano page does; the home page's demo waits for a touch). */
	load(warm = false) {
		if (this.#loaded || typeof window === "undefined") return;
		this.#loaded = true;
		const p = loadPianoPreferences();
		this.instrument = p.instrument;
		this.octave = p.octave;
		this.volume = p.volume;
		this.reverb = p.reverb;
		if (warm && this.instrument === "grand") this.#samples();
	}
	/** The samples, fetched and (once there is a context) decoded; the state for the screen. */
	#samples() {
		if (pianoSamplesReady()) {
			this.samples = "ready";
			return;
		}
		warmPianoSamples();
		if (this.samples !== "loading") this.samples = "loading";
		const ctx = this.#ctx;
		if (!ctx) return;
		loadPianoSamples(ctx).then(
			() => (this.samples = "ready"),
			() => (this.samples = pianoSamplesFailed() ? "failed" : "idle"),
		);
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
		const ctx = new AudioContext({ latencyHint: "interactive" });
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

	#pending: (() => void)[] = [];
	#waking: ReturnType<typeof setTimeout> | null = null;

	/**
	 * Open and start the audio on a touch, ahead of the first note: iOS
	 * starts a context suspended and takes a moment to resume, and a note
	 * scheduled in that moment sits at time zero and sounds late, all the
	 * pressed notes together, once the context wakes. The wake is watched
	 * by polling the context's state (with a statechange listener too),
	 * not by the promise `resume()` returns: on iOS that promise has been
	 * seen never to settle although the context does start. A silent
	 * one-sample buffer is played as well, the old unlock for iOS. After
	 * three seconds without a running context the switch gives up (and a
	 * later touch tries again), so it can never spin for ever.
	 */
	warm() {
		const ctx = this.#graph();
		if (this.instrument === "grand" && this.samples !== "ready") this.#samples();
		if (ctx.state === "running") {
			this.starting = false;
			this.wake = null;
			this.on = true;
			this.#flush();
			return;
		}
		this.starting = true;
		void ctx.resume().catch(() => {});
		try {
			const unlock = ctx.createBufferSource();
			unlock.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
			unlock.connect(ctx.destination);
			unlock.start(0);
		} catch {
			// Not every browser lets a buffer play before the context runs; the resume alone may do.
		}
		if (this.#waking !== null) return;
		const began = Date.now();
		const check = () => {
			if (ctx.state === "running") {
				this.#waking = null;
				this.starting = false;
				this.wake = null;
				this.on = true;
				this.#flush();
			} else if (Date.now() - began > 3000) {
				// Given up on this context: let it go, so the next touch gets a fresh one (iOS has been seen to leave one that never starts).
				this.#waking = null;
				this.starting = false;
				this.wake = { state: `${ctx.state}, gave up`, seconds: 3 };
				this.#pending = [];
				this.#dropContext();
			} else {
				this.wake = { state: ctx.state, seconds: Math.round((Date.now() - began) / 100) / 10 };
				this.#waking = setTimeout(check, 100);
			}
		};
		ctx.onstatechange = () => {
			if (this.#waking !== null) {
				clearTimeout(this.#waking);
				this.#waking = null;
				check();
			}
		};
		this.#waking = setTimeout(check, 50);
	}
	/** Forget the audio graph; the next touch builds a new one. */
	#dropContext() {
		const ctx = this.#ctx;
		this.#ctx = null;
		this.#master = null;
		this.#dry = null;
		this.#wet = null;
		this.#voices.clear();
		this.#order = [];
		if (ctx) {
			ctx.onstatechange = null;
			void ctx.close().catch(() => {});
		}
	}
	#flush() {
		const run = this.#pending;
		this.#pending = [];
		for (const f of run) f();
	}
	/** The power switch: on warms the audio ahead of the first note, so the first note is not late; off silences and suspends it. */
	async setOn(on: boolean) {
		if (on) {
			this.warm();
			return;
		}
		this.allOff();
		this.on = false;
		this.starting = false;
		await this.#ctx?.suspend().catch(() => {});
	}

	noteOn(midi: number, velocity = 0.8) {
		if (midi < 0 || midi > 127) return;
		if (!this.#held.on(midi)) return;
		const ctx = this.#graph();
		if (ctx.state !== "running") {
			// Not awake yet: start the note once it is, unless the key was let go meanwhile.
			this.#pending.push(() => {
				if (this.#held.down.has(midi) || this.#held.held.has(midi)) this.#start(midi, velocity);
			});
			this.warm();
			this.sounding = this.#held.sounding;
			return;
		}
		this.#start(midi, velocity);
	}
	#start(midi: number, velocity: number) {
		const ctx = this.#ctx;
		if (!ctx || this.#voices.has(midi)) return;
		const now = ctx.currentTime;
		// Room for one more: the oldest voice goes.
		while (this.#order.length >= PIANO_MAX_VOICES) {
			const oldest = this.#order.shift()!;
			this.#voices.get(oldest)?.release(now);
			this.#voices.delete(oldest);
		}
		let voice =
			this.instrument === "grand"
				? startSampledVoice(ctx, this.#dry!, midi, velocity, now)
				: startVoice(ctx, this.#dry!, this.instrument, midi, velocity, now);
		// The Grand Piano before its samples are decoded: the Electric Piano stands in (the screen says loading).
		if (!voice) {
			this.#samples();
			voice = startVoice(ctx, this.#dry!, "epiano", midi, velocity, now);
		}
		this.#voices.set(midi, voice);
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
		if (id === "grand") this.#samples();
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
