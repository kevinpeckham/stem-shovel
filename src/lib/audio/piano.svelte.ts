import {
	PIANO_MAX_VOICES,
	PIANO_OCTAVE_MAX,
	PIANO_OCTAVE_MIN,
	type PianoInstrumentId,
} from "$lib/constants/piano";
import type { PianoKey } from "$lib/constants/scales";
import { HeldNotes } from "$lib/utils/heldNotes";
import {
	DEFAULT_PIANO_CHORUS,
	DEFAULT_PIANO_DELAY,
	DEFAULT_PIANO_FUZZ,
	DEFAULT_PIANO_PHASER,
	DEFAULT_PIANO_REVERB,
	DEFAULT_PIANO_REVERB_SIZE,
	DEFAULT_PIANO_ROTARY,
	DEFAULT_PIANO_TONE,
	DEFAULT_PIANO_TREMOLO,
	DEFAULT_PIANO_WAH,
	loadPianoPreferences,
	savePianoPreferences,
	type PianoChorus,
	type PianoDelay,
	type PianoFuzz,
	type PianoPhaser,
	type PianoRotary,
	type PianoTone,
	type PianoTremolo,
	type PianoWah,
} from "$lib/utils/pianoPreferences";
import type { PianoPresetData } from "$lib/val/PianoPresetSchema";
import { createPianoFx, type PianoFx } from "./pianoFx";
import { playThroughSilentSwitch } from "./playThroughSilentSwitch";
import {
	flacSupported,
	loadPianoSamples,
	loadPianoTier,
	pianoDemoReady,
	pianoHiresCached,
	pianoTierReady,
	startSampledVoice,
	warmPianoSamples,
	type PianoTier,
} from "./pianoSamples";
import {
	loadSamples,
	startSampledInstrumentVoice,
	warmSamples,
	type SampledInstrumentId,
} from "./sampledInstruments";
import { startVoice, type SynthVoice } from "./synthVoice";

/**
 * The one piano on the page (docs/piano.md): notes come in from the
 * on-screen keys, the computer keyboard or a MIDI controller as MIDI note
 * numbers, and each starts a synthVoice into a master gain with a room
 * behind it (the drum machine's synthesized reverb, small). HeldNotes keeps
 * the pedal's bookkeeping. The AudioContext opens on the first note (a
 * gesture, as browsers require). The choices are remembered per browser.
 */
/** A finite number held to [min, max] and rounded to `steps` per unit (100 = hundredths); the fallback for anything else is min. */
function clamp(v: number, min: number, max: number, steps = 100): number {
	if (!Number.isFinite(v)) return min;
	return Math.min(max, Math.max(min, Math.round(v * steps) / steps));
}

/** The instruments with a few samples of their own (not the Grand Piano's tiers). */
const isSampled = (id: string): id is SampledInstrumentId => id === "bass" || id === "guitar";

class PianoEngine {
	instrument = $state<PianoInstrumentId>("epiano");
	/** The octave the on-screen keyboard's lowest C sits in. */
	octave = $state(3);
	volume = $state(0.8);
	reverb = $state(DEFAULT_PIANO_REVERB);
	/** The room's size, 0 a small room to 1 a hall (the impulse is synthesized again on change). */
	reverbSize = $state(DEFAULT_PIANO_REVERB_SIZE);
	/** The delay: time, feedback, level, analog character (docs/piano.md, "Effects"); level 0 is off. */
	delay = $state<PianoDelay>({ ...DEFAULT_PIANO_DELAY });
	/** The chorus (mix 0 is off), the tremolo (depth 0 is off), the fuzz (drive 0 is off), the phaser (mix 0 is off) and the rotary speaker. */
	chorus = $state<PianoChorus>({ ...DEFAULT_PIANO_CHORUS });
	tremolo = $state<PianoTremolo>({ ...DEFAULT_PIANO_TREMOLO });
	fuzz = $state<PianoFuzz>({ ...DEFAULT_PIANO_FUZZ });
	wah = $state<PianoWah>({ ...DEFAULT_PIANO_WAH });
	phaser = $state<PianoPhaser>({ ...DEFAULT_PIANO_PHASER });
	rotary = $state<PianoRotary>({ ...DEFAULT_PIANO_ROTARY });
	/** Tone: tilt (-1 to 1), air and bottom (0 off). */
	tone = $state<PianoTone>({ ...DEFAULT_PIANO_TONE });
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
	/** The Grand Piano's demo tier: fetching and decoding, ready, or failed to load (the synths still play). */
	samples = $state<"idle" | "loading" | "ready" | "failed">("idle");
	/** The best tier fully in: the demo, the standard tier (loaded in the background on the piano page) or hi-res (the button). */
	tier = $state<PianoTier>("demo");
	/** Tiers on their way, with their progress (the standard tier and hi-res can load side by side). */
	loadingTiers = $state<Partial<Record<PianoTier, { done: number; total: number }>>>({});
	/** The Hi-res choice, remembered per browser. */
	hires = $state(false);
	/** The key lit on the keyboard (docs/piano.md, "Key and chords"), and whether its keys are numbered by degree; remembered. */
	key = $state<PianoKey | null>(null);
	degrees = $state(false);
	/** The computer-key letters on the keys; a small toggle hides them. */
	labels = $state(true);
	/** Whether this browser decodes FLAC (null until the probe answers): hi-res comes as mp3 where it does not. */
	flac = $state<boolean | null>(null);
	/** Where the standard and hi-res tiers live (the page's load says; null where there is no store). */
	samplesBase: string | null = null;
	#standardWanted = false;

	#ctx: AudioContext | null = null;
	/** The effect chain (pianoFx.ts): voices play into `fx.input`; `fx.master` is what the speaker gets. */
	#fx: PianoFx | null = null;
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
		this.reverbSize = p.reverbSize;
		this.delay = { ...p.delay };
		this.chorus = { ...p.chorus };
		this.tremolo = { ...p.tremolo };
		this.fuzz = { ...p.fuzz };
		this.wah = { ...p.wah };
		this.phaser = { ...p.phaser };
		this.rotary = { ...p.rotary };
		this.tone = { ...p.tone };
		this.hires = p.hires;
		this.key = p.key;
		this.degrees = p.degrees;
		this.labels = p.labels;
		void flacSupported().then((ok) => (this.flac = ok));
		// The piano page: the standard tier follows the demo, and hi-res too if it was chosen before.
		this.#standardWanted = warm;
		if (warm && this.instrument === "grand") this.#samples();
	}
	/** After the demo tier: the standard tier in the background, and hi-res as soon as it is chosen (from the cache after the first time), each on its own. */
	/**
	 * A context to decode samples with before the piano is on: an offline
	 * one needs no gesture, and a decoded AudioBuffer plays in any context,
	 * so the tiers can arrive while the piano is off (a remembered Hi-res
	 * choice used to sit at 0% until the switch).
	 */
	#decoder: OfflineAudioContext | null = null;
	#decodeContext(): BaseAudioContext {
		if (this.#ctx) return this.#ctx;
		this.#decoder ??= new OfflineAudioContext(1, 1, 44100);
		return this.#decoder;
	}
	#tiers() {
		const ctx = this.#decodeContext();
		const base = this.samplesBase;
		if (!base || !this.#standardWanted || this.instrument !== "grand") return;
		const wanted: ("standard" | "hires")[] = ["standard"];
		if (this.hires) wanted.push("hires");
		for (const tier of wanted) {
			if (pianoTierReady(tier) || this.loadingTiers[tier]) continue;
			this.loadingTiers = { ...this.loadingTiers, [tier]: { done: 0, total: 0 } };
			loadPianoTier(ctx, tier, base, (done, total) => {
				if (this.loadingTiers[tier])
					this.loadingTiers = { ...this.loadingTiers, [tier]: { done, total } };
			}).then(
				() => {
					if (tier === "hires" || this.tier === "demo") this.tier = tier;
					const { [tier]: _done, ...rest } = this.loadingTiers;
					this.loadingTiers = rest;
				},
				() => {
					const { [tier]: _failed, ...rest } = this.loadingTiers;
					this.loadingTiers = rest;
				},
			);
		}
	}
	/** The Hi-res button: remember the choice and fetch the tier (the cache serves it on later visits). */
	enableHires() {
		this.hires = true;
		// The samples are the Grand Piano's: pressing the button with another sound chosen brings the grand back.
		if (this.instrument !== "grand") this.setInstrument("grand");
		this.#save();
		this.#samples();
		this.#tiers();
	}
	/** Whether a past opt-in left the hi-res tier in the browser's cache, for the button's label. */
	hiresCached(): Promise<boolean> {
		return this.samplesBase ? pianoHiresCached(this.samplesBase) : Promise.resolve(false);
	}
	/** The samples, fetched and (once there is a context) decoded; the state for the screen. */
	/** Fetch the Grand Piano's demo tier without opening the audio (no gesture needed): the home page calls it as the demo scrolls into view, so the first touch finds the samples in. */
	prefetch() {
		if (this.instrument === "grand") warmPianoSamples();
		if (isSampled(this.instrument)) warmSamples(this.instrument);
	}
	#samples() {
		if (pianoDemoReady()) {
			this.samples = "ready";
			this.#tiers();
			return;
		}
		warmPianoSamples();
		if (this.samples !== "loading") this.samples = "loading";
		const ctx = this.#decodeContext();
		loadPianoSamples(ctx).then(
			() => {
				this.samples = "ready";
				this.#tiers();
			},
			() => (this.samples = "failed"),
		);
	}
	#save() {
		savePianoPreferences({
			instrument: this.instrument,
			octave: this.octave,
			volume: this.volume,
			reverb: this.reverb,
			reverbSize: this.reverbSize,
			delay: { ...this.delay },
			chorus: { ...this.chorus },
			tremolo: { ...this.tremolo },
			fuzz: { ...this.fuzz },
			wah: { ...this.wah },
			phaser: { ...this.phaser },
			rotary: { ...this.rotary },
			tone: { ...this.tone },
			hires: this.hires,
			key: this.key,
			degrees: this.degrees,
			labels: this.labels,
		});
	}

	#graph(): AudioContext {
		if (this.#ctx) return this.#ctx;
		playThroughSilentSwitch();
		const ctx = new AudioContext({ latencyHint: "interactive" });
		this.#ctx = ctx;
		this.#fx = createPianoFx(ctx, this.#fxSettings());
		return ctx;
	}
	/** The context belongs to a host (the looper, docs/looper.md): never suspended or closed by the piano. */
	#hosted = false;
	/**
	 * Builds the piano's graph in the host's context instead of one of its
	 * own, so the host can tap `output()` sample-accurately (the looper,
	 * docs/looper.md). Call before the first note; a context the piano
	 * already made is dropped. The power switch then only mutes.
	 */
	hostContext(ctx: AudioContext) {
		if (this.#ctx === ctx) return;
		this.#dropContext();
		this.#ctx = ctx;
		this.#hosted = true;
		this.#fx = createPianoFx(ctx, this.#fxSettings());
		this.on = ctx.state === "running";
	}
	/** The last node before the destination, for a host to tap (built now if it is not yet; call from a gesture). */
	output(): AudioNode {
		this.#graph();
		return this.#fx!.master;
	}

	#fxSettings() {
		return {
			volume: this.volume,
			reverb: this.reverb,
			reverbSize: this.reverbSize,
			delay: { ...this.delay },
			chorus: { ...this.chorus },
			tremolo: { ...this.tremolo },
			fuzz: { ...this.fuzz },
			wah: { ...this.wah },
			phaser: { ...this.phaser },
			rotary: { ...this.rotary },
			tone: { ...this.tone },
		};
	}

	#capture: MediaStreamAudioDestinationNode | null = null;
	/**
	 * The piano's sound as a MediaStream (what the speaker gets, volume and
	 * reverb included), for the Idea Recorder to mix into a take. Opens the
	 * audio if it is not open yet, so call it from a gesture.
	 */
	captureStream(): MediaStream {
		const ctx = this.#graph();
		if (!this.#capture) {
			this.#capture = ctx.createMediaStreamDestination();
			this.#fx!.master.connect(this.#capture);
		}
		return this.#capture.stream;
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
		const hosted = this.#hosted;
		this.#ctx = null;
		this.#fx = null;
		this.#hosted = false;
		this.#voices.clear();
		this.#order = [];
		if (ctx && !hosted) {
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
		if (!this.#hosted) await this.#ctx?.suspend().catch(() => {});
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
		if (!ctx) return;
		const now = ctx.currentTime;
		// A restrike of a note the pedal holds: the old voice lets go as the new one starts.
		const sustained = this.#voices.get(midi);
		if (sustained) {
			sustained.release(now);
			this.#voices.delete(midi);
			this.#order = this.#order.filter((n) => n !== midi);
		}
		// Room for one more: the oldest voice goes.
		while (this.#order.length >= PIANO_MAX_VOICES) {
			const oldest = this.#order.shift()!;
			this.#voices.get(oldest)?.release(now);
			this.#voices.delete(oldest);
		}
		const sampled = isSampled(this.instrument) ? this.instrument : null;
		let voice =
			this.instrument === "grand"
				? startSampledVoice(ctx, this.#fx!.input, midi, velocity, now)
				: sampled
					? startSampledInstrumentVoice(ctx, this.#fx!.input, sampled, midi, velocity, now)
					: startVoice(ctx, this.#fx!.input, this.instrument, midi, velocity, now);
		// The Grand Piano before its samples are decoded: the Electric Piano stands in (the screen says loading); a small sampled instrument's own synthesized stand-in likewise.
		if (!voice) {
			if (sampled) void loadSamples(sampled, ctx);
			else this.#samples();
			voice = startVoice(ctx, this.#fx!.input, sampled ?? "epiano", midi, velocity, now);
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
		if (isSampled(id)) void loadSamples(id, this.#decodeContext());
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
	setKey(key: PianoKey | null) {
		this.key = key;
		this.#save();
	}
	setLabels(on: boolean) {
		this.labels = on;
		this.#save();
	}
	setDegrees(on: boolean) {
		this.degrees = on;
		this.#save();
	}
	setVolume(v: number) {
		if (!Number.isFinite(v)) return;
		this.volume = Math.min(1, Math.max(0, Math.round(v * 100) / 100));
		this.#fx?.update({ volume: this.volume });
		this.#save();
	}
	setReverb(v: number) {
		if (!Number.isFinite(v)) return;
		this.reverb = Math.min(1, Math.max(0, Math.round(v * 100) / 100));
		this.#fx?.update({ reverb: this.reverb });
		this.#save();
	}
	setReverbSize(v: number) {
		if (!Number.isFinite(v)) return;
		this.reverbSize = Math.min(1, Math.max(0, Math.round(v * 100) / 100));
		this.#fx?.update({ reverbSize: this.reverbSize });
		this.#save();
	}
	/** The delay's time (seconds), feedback, level and analog character, any of them. */
	setDelay(patch: Partial<PianoDelay>) {
		const d = { ...this.delay, ...patch };
		d.time = clamp(d.time, 0.05, 1, 1000);
		d.feedback = clamp(d.feedback, 0, 0.9);
		d.level = clamp(d.level, 0, 1);
		d.analog = d.analog === true;
		this.delay = d;
		this.#fx?.update({ delay: d });
		this.#save();
	}
	/** The chorus's rate (Hz), depth and mix, any of them; mix 0 is off. */
	setChorus(patch: Partial<PianoChorus>) {
		const c = { ...this.chorus, ...patch };
		c.rate = clamp(c.rate, 0.1, 5);
		c.depth = clamp(c.depth, 0, 1);
		c.mix = clamp(c.mix, 0, 1);
		this.chorus = c;
		this.#fx?.update({ chorus: c });
		this.#save();
	}
	/** The tremolo's rate (Hz), depth and shape, any of them; depth 0 is off. */
	setTremolo(patch: Partial<PianoTremolo>) {
		const t = { ...this.tremolo, ...patch };
		t.rate = clamp(t.rate, 0.5, 12);
		t.depth = clamp(t.depth, 0, 1);
		t.shape = t.shape === "square" ? "square" : "sine";
		this.tremolo = t;
		this.#fx?.update({ tremolo: t });
		this.#save();
	}
	/** The fuzz's drive and tone, either; drive 0 is off. */
	setFuzz(patch: Partial<PianoFuzz>) {
		const f = { ...this.fuzz, ...patch };
		f.drive = clamp(f.drive, 0, 1);
		f.tone = clamp(f.tone, 0, 1);
		this.fuzz = f;
		this.#fx?.update({ fuzz: f });
		this.#save();
	}
	/** The wah: mode, sensitivity, rate, range, resonance and mix, any of them; mix 0 is off. */
	setWah(patch: Partial<PianoWah>) {
		const w = { ...this.wah, ...patch };
		w.mode = w.mode === "sweep" ? "sweep" : "touch";
		w.sensitivity = clamp(w.sensitivity, 0, 1);
		w.rate = clamp(w.rate, 0.1, 5);
		w.range = clamp(w.range, 0, 1);
		w.resonance = clamp(w.resonance, 0, 1);
		w.mix = clamp(w.mix, 0, 1);
		this.wah = w;
		this.#fx?.update({ wah: w });
		this.#save();
	}
	/** The phaser or flanger: its mode, rate (Hz), depth and mix, any of them; mix 0 is off. */
	setPhaser(patch: Partial<PianoPhaser>) {
		const p = { ...this.phaser, ...patch };
		p.mode = p.mode === "flanger" ? "flanger" : "phaser";
		p.rate = clamp(p.rate, 0.1, 5);
		p.depth = clamp(p.depth, 0, 1);
		p.mix = clamp(p.mix, 0, 1);
		this.phaser = p;
		this.#fx?.update({ phaser: p });
		this.#save();
	}
	/** Tone: tilt, air and bottom, any of them. */
	setTone(patch: Partial<PianoTone>) {
		const t = { ...this.tone, ...patch };
		t.tilt = Number.isFinite(t.tilt)
			? Math.min(1, Math.max(-1, Math.round(t.tilt * 100) / 100))
			: 0;
		t.air = clamp(t.air, 0, 1);
		t.bottom = clamp(t.bottom, 0, 1);
		this.tone = t;
		this.#fx?.update({ tone: t });
		this.#save();
	}
	/** The rotary speaker: off, slow or fast (the rotors glide between speeds). */
	setRotary(speed: PianoRotary["speed"]) {
		const r = { speed };
		this.rotary = r;
		this.#fx?.update({ rotary: r });
		this.#save();
	}

	// ---- presets (docs/piano.md, "Presets") ----
	/** The sound and every effect as they stand: what a preset keeps (volume, octave, key and labels are not part of it). */
	currentPreset(): PianoPresetData {
		return {
			instrument: this.instrument,
			reverb: this.reverb,
			reverbSize: this.reverbSize,
			delay: { ...this.delay },
			chorus: { ...this.chorus },
			phaser: { ...this.phaser },
			tremolo: { ...this.tremolo },
			fuzz: { ...this.fuzz },
			wah: { ...this.wah },
			rotary: { ...this.rotary },
			tone: { ...this.tone },
		};
	}
	/** A preset into the piano: the sound and every effect, through the setters so the chain ramps and the choices are remembered. */
	applyPreset(p: PianoPresetData) {
		this.setInstrument(p.instrument);
		this.setReverb(p.reverb);
		this.setReverbSize(p.reverbSize);
		this.setDelay(p.delay);
		this.setChorus(p.chorus);
		this.setPhaser(p.phaser);
		this.setTremolo(p.tremolo);
		this.setFuzz(p.fuzz);
		this.setWah(p.wah);
		this.setRotary(p.rotary.speed);
		this.setTone(p.tone);
	}

	/** Every effect back to how the piano starts (the sound stays): the Effects menu's reset. */
	resetEffects() {
		this.applyPreset({
			instrument: this.instrument,
			reverb: DEFAULT_PIANO_REVERB,
			reverbSize: DEFAULT_PIANO_REVERB_SIZE,
			delay: { ...DEFAULT_PIANO_DELAY },
			chorus: { ...DEFAULT_PIANO_CHORUS },
			phaser: { ...DEFAULT_PIANO_PHASER },
			tremolo: { ...DEFAULT_PIANO_TREMOLO },
			fuzz: { ...DEFAULT_PIANO_FUZZ },
			wah: { ...DEFAULT_PIANO_WAH },
			rotary: { ...DEFAULT_PIANO_ROTARY },
			tone: { ...DEFAULT_PIANO_TONE },
		});
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
		} else if (kind === 0xb0 && (note === 1 || note === 11 || note === 4)) {
			// The mod wheel, an expression pedal or a foot controller rides the wah while it sends.
			this.#fx?.wahPedal(value / 127);
		} else if (kind === 0xb0 && (note === 120 || note === 123)) {
			this.allOff();
		}
	};
	disconnectMidi() {
		if (this.#access) for (const input of this.#access.inputs.values()) input.onmidimessage = null;
		this.#access = null;
		this.midi = { status: "idle", inputs: [] };
		this.#fx?.wahPedal(null);
	}
}

export const piano = new PianoEngine();
