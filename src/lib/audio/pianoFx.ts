import { reverbImpulse } from "./drumBus";

/**
 * The piano's effect chain (docs/piano.md, "Effects"), built once per
 * context and driven by `update`: voices play into `input`, which runs
 * through a fuzz (a hot gain into a soft clipper, a tone low-pass after),
 * a stereo chorus (two short delays swept by one LFO in opposite
 * directions, mixed against the dry signal), a phaser (four all-pass
 * stages swept by an LFO, mixed against the dry signal so notches move
 * through the sound), a tremolo (a gain swung by an LFO, sine or square)
 * and a rotary speaker (the sound split at 800 Hz into a horn and a drum,
 * each spun by its own LFO through pan, level and a Doppler delay, at a
 * slow or fast speed the LFOs glide between), into the dry bus; from the
 * dry bus, sends into a reverb (the drum machine's synthesized room) and
 * a delay (delay → damping → feedback, with an "analog" character: a
 * soft clip in the loop, darker repeats and a slow wobble of the time),
 * each returning into `master`. Every level is a gain the setters ramp
 * over 20 ms so a slider never clicks. Plain Web Audio: an
 * OfflineAudioContext renders the same, which is how it is measured.
 */
export interface PianoDelaySettings {
	time: number;
	feedback: number;
	level: number;
	/** Tape-like repeats: a soft clip in the loop, a darker damping, a slow wobble of the time. */
	analog: boolean;
}
export interface PianoChorusSettings {
	/** LFO rate in Hz. */
	rate: number;
	/** How far the delays sweep, 0 to 1. */
	depth: number;
	/** Wet level, 0 (off) to 1. */
	mix: number;
}
export interface PianoTremoloSettings {
	/** LFO rate in Hz. */
	rate: number;
	/** How deep the level swings, 0 (off) to 1 (to silence). */
	depth: number;
	shape: "sine" | "square";
}
export interface PianoFuzzSettings {
	/** How hard the clipper is driven, 0 (off) to 1. */
	drive: number;
	/** The low-pass after the clipper, 0 dark to 1 bright. */
	tone: number;
}
export interface PianoPhaserSettings {
	/** LFO rate in Hz. */
	rate: number;
	/** How far the notches sweep, 0 to 1. */
	depth: number;
	/** Wet level, 0 (off) to 1 (equal to the dry, the deepest notches). */
	mix: number;
}
export interface PianoRotarySettings {
	speed: "off" | "slow" | "fast";
}
export interface PianoFxSettings {
	volume: number;
	reverb: number;
	reverbSize: number;
	delay: PianoDelaySettings;
	chorus: PianoChorusSettings;
	tremolo: PianoTremoloSettings;
	fuzz: PianoFuzzSettings;
	phaser: PianoPhaserSettings;
	rotary: PianoRotarySettings;
}

export interface PianoFx {
	/** Where the voices play into. */
	input: AudioNode;
	/** The last node before the destination (the recorder's capture taps it). */
	master: GainNode;
	update(patch: Partial<PianoFxSettings>): void;
}

const RAMP = 0.02;
/** The rotary speaker's rotation rates in Hz, horn and drum, at each speed (a Leslie's: the drum lags the horn). */
const ROTARY_HZ = { off: [0, 0], slow: [0.8, 0.7], fast: [6.7, 5.7] } as const;

function curve(f: (x: number) => number): Float32Array<ArrayBuffer> {
	const n = 2048;
	const out = new Float32Array(new ArrayBuffer(n * 4));
	for (let i = 0; i < n; i++) out[i] = f((i / (n - 1)) * 2 - 1);
	return out;
}
/**
 * A gentle soft clip for the analog delay's loop (unity at small signals,
 * so the feedback stays what the slider says; the peaks fold down as tape
 * saturates); identity for the digital one.
 */
const shaperCurve = (analog: boolean) => curve(analog ? (x) => Math.tanh(x * 1.6) / 1.6 : (x) => x);
/** The fuzz's clipper: a tanh the drive gain pushes towards a square. */
const FUZZ_CURVE = curve((x) => Math.tanh(x));
/**
 * The fuzz's gain into the clipper, and the make-up after it: a voice peaking
 * near 0.3 comes out of the clipper at tanh(0.3 · pre), so dividing by that
 * holds the peaks where the clean sound's were at every drive (measured: the
 * loudness stays within 2 dB of clean from off to full).
 */
const fuzzPre = (drive: number) => 1 + drive * 30;
const fuzzMakeup = (drive: number) => (0.9 * 0.3) / Math.tanh(0.3 * fuzzPre(drive));
const fuzzTone = (tone: number) => 700 * 10 ** tone; // 700 Hz to 7 kHz
/** The phaser's four all-pass stages, their centre frequencies and how far the LFO moves each. */
const PHASER_STAGES = [500, 800, 1300, 2100];
const PHASER_SWEEP = 400;

/** An oscillator started now, into a gain: the LFO and the gain that scales it. */
function lfo(ctx: BaseAudioContext, hz: number, amount: number, type: OscillatorType = "sine") {
	const osc = ctx.createOscillator();
	osc.type = type;
	osc.frequency.value = hz;
	const gain = ctx.createGain();
	gain.gain.value = amount;
	osc.connect(gain);
	osc.start();
	return { osc, gain };
}

export function createPianoFx(ctx: BaseAudioContext, initial: PianoFxSettings): PianoFx {
	const s: PianoFxSettings = structuredClone(initial);
	const ramp = (param: AudioParam, value: number, tau = RAMP) =>
		param.setTargetAtTime(value, ctx.currentTime, tau);
	const master = ctx.createGain();
	master.gain.value = s.volume;
	master.connect(ctx.destination);
	const input = ctx.createGain();

	// Fuzz: dry and wet in a crossfade the drive settles by a quarter of its travel.
	const fuzzDry = ctx.createGain();
	const fuzzPreGain = ctx.createGain();
	const fuzzShaper = ctx.createWaveShaper();
	fuzzShaper.curve = FUZZ_CURVE;
	fuzzShaper.oversample = "4x";
	const fuzzToneNode = ctx.createBiquadFilter();
	fuzzToneNode.type = "lowpass";
	const fuzzWet = ctx.createGain();
	const fuzzOut = ctx.createGain();
	input.connect(fuzzDry);
	fuzzDry.connect(fuzzOut);
	input.connect(fuzzPreGain);
	fuzzPreGain.connect(fuzzShaper);
	fuzzShaper.connect(fuzzToneNode);
	fuzzToneNode.connect(fuzzWet);
	fuzzWet.connect(fuzzOut);
	const applyFuzz = (f: PianoFuzzSettings, tau: number) => {
		const wet = Math.min(1, f.drive * 4);
		ramp(fuzzDry.gain, 1 - wet, tau);
		ramp(fuzzPreGain.gain, fuzzPre(f.drive), tau);
		ramp(fuzzToneNode.frequency, fuzzTone(f.tone), tau);
		ramp(fuzzWet.gain, wet * fuzzMakeup(f.drive), tau);
	};
	applyFuzz(s.fuzz, 0);

	// Chorus: dry through at full, the two swept delays at `mix`, panned apart.
	const chorusOut = ctx.createGain();
	fuzzOut.connect(chorusOut);
	const chorusWet = ctx.createGain();
	chorusWet.gain.value = s.chorus.mix;
	const chorusLfo = lfo(ctx, s.chorus.rate, s.chorus.depth * 0.004); // up to ±4 ms
	const chorusInv = ctx.createGain();
	chorusInv.gain.value = -1;
	chorusLfo.gain.connect(chorusInv);
	for (const [base, pan, mod] of [
		[0.022, -0.6, chorusLfo.gain],
		[0.028, 0.6, chorusInv],
	] as const) {
		const d = ctx.createDelay(0.1);
		d.delayTime.value = base;
		mod.connect(d.delayTime);
		const p = ctx.createStereoPanner();
		p.pan.value = pan;
		fuzzOut.connect(d);
		d.connect(p);
		p.connect(chorusWet);
	}
	chorusWet.connect(chorusOut);

	// Phaser: four all-pass stages in series, swept together; `mix` crossfades from dry to half
	// and half, where the notches are deepest (an all-pass keeps the level, so the sum stays near it).
	const phaserOut = ctx.createGain();
	const phaserDry = ctx.createGain();
	phaserDry.gain.value = 1 - s.phaser.mix / 2;
	chorusOut.connect(phaserDry);
	phaserDry.connect(phaserOut);
	const phaserWet = ctx.createGain();
	phaserWet.gain.value = s.phaser.mix / 2;
	const phaserLfo = lfo(ctx, s.phaser.rate, s.phaser.depth * PHASER_SWEEP);
	let stage: AudioNode = chorusOut;
	for (const hz of PHASER_STAGES) {
		const ap = ctx.createBiquadFilter();
		ap.type = "allpass";
		ap.frequency.value = hz;
		ap.Q.value = 0.7;
		phaserLfo.gain.connect(ap.frequency);
		stage.connect(ap);
		stage = ap;
	}
	stage.connect(phaserWet);
	phaserWet.connect(phaserOut);

	// Tremolo: the gain sits at 1 - depth/2 and the LFO swings it by ±depth/2. The LFO passes a
	// low-pass on its way so a square's edges take a few milliseconds: an instant step in the level
	// is a click on a sustained note (Kevin heard a crunch on the Electric Piano).
	const trem = ctx.createGain();
	trem.gain.value = 1 - s.tremolo.depth / 2;
	const tremLfo = lfo(ctx, s.tremolo.rate, s.tremolo.depth / 2, s.tremolo.shape);
	const tremSmooth = ctx.createBiquadFilter();
	tremSmooth.type = "lowpass";
	tremSmooth.frequency.value = 80;
	tremSmooth.Q.value = 0.5;
	tremLfo.gain.connect(tremSmooth);
	tremSmooth.connect(trem.gain);
	phaserOut.connect(trem);

	// Rotary: horn above 800 Hz and drum below, each spun by its own LFO (opposite ways) through a Doppler delay, a level swing and the pan.
	const rotaryOut = ctx.createGain();
	const rotaryDry = ctx.createGain();
	trem.connect(rotaryDry);
	rotaryDry.connect(rotaryOut);
	const rotaryWet = ctx.createGain();
	rotaryWet.connect(rotaryOut);
	/** The two bands overlap at the crossover, so the wet is trimmed to sit at the dry's loudness (measured on a 300 Hz and a 1.5 kHz tone). */
	const ROTARY_TRIM = 0.8;
	const rotors = (
		[
			["highpass", 1, 0.0004, 0.3, 0.8],
			["lowpass", -1, 0.00015, 0.2, 0.6],
		] as const
	).map(([type, dir, doppler, swing, width]) => {
		const split = ctx.createBiquadFilter();
		split.type = type;
		split.frequency.value = 800;
		split.Q.value = 0.5;
		const spin = lfo(ctx, 0, 1);
		const delay = ctx.createDelay(0.01);
		delay.delayTime.value = 0.002;
		const dop = ctx.createGain();
		dop.gain.value = doppler * dir;
		spin.gain.connect(dop);
		dop.connect(delay.delayTime);
		const level = ctx.createGain();
		level.gain.value = 1 - swing / 2;
		const lev = ctx.createGain();
		lev.gain.value = swing / 2;
		spin.gain.connect(lev);
		lev.connect(level.gain);
		const pan = ctx.createStereoPanner();
		const panMod = ctx.createGain();
		panMod.gain.value = width * dir;
		spin.gain.connect(panMod);
		panMod.connect(pan.pan);
		trem.connect(split);
		split.connect(delay);
		delay.connect(level);
		level.connect(pan);
		pan.connect(rotaryWet);
		return spin.osc;
	});
	const applyRotary = (r: PianoRotarySettings, tau: number) => {
		const on = r.speed !== "off";
		ramp(rotaryDry.gain, on ? 0 : 1, tau);
		ramp(rotaryWet.gain, on ? ROTARY_TRIM : 0, tau);
		// The rotors glide to the new speed, the horn in about a second, the heavier drum in two; off lets them coast down.
		const [horn, drum] = ROTARY_HZ[r.speed];
		ramp(rotors[0]!.frequency, horn, tau && 0.5);
		ramp(rotors[1]!.frequency, drum, tau && 1);
	};
	applyRotary(s.rotary, 0);

	// The dry bus, and the two sends.
	const dry = ctx.createGain();
	rotaryOut.connect(dry);
	dry.connect(master);

	const convolver = ctx.createConvolver();
	convolver.buffer = reverbImpulse(ctx, s.reverbSize);
	const wet = ctx.createGain();
	wet.gain.value = s.reverb * 0.5;
	dry.connect(convolver);
	convolver.connect(wet);
	wet.connect(master);

	const delay = ctx.createDelay(1.1);
	delay.delayTime.value = s.delay.time;
	const shaper = ctx.createWaveShaper();
	shaper.curve = shaperCurve(s.delay.analog);
	const damping = ctx.createBiquadFilter();
	damping.type = "lowpass";
	damping.frequency.value = s.delay.analog ? 2000 : 3200;
	const feedback = ctx.createGain();
	feedback.gain.value = s.delay.feedback;
	const delayReturn = ctx.createGain();
	delayReturn.gain.value = s.delay.level;
	dry.connect(delay);
	delay.connect(shaper);
	shaper.connect(damping);
	damping.connect(feedback);
	feedback.connect(delay);
	delay.connect(delayReturn);
	delayReturn.connect(master);
	// The wobble: a slow LFO on the time, only in analog.
	const wobble = lfo(ctx, 0.4, s.delay.analog ? 0.0015 : 0);
	wobble.gain.connect(delay.delayTime);

	const apply: { [K in keyof PianoFxSettings]: (v: PianoFxSettings[K]) => void } = {
		volume: (v) => ramp(master.gain, v),
		reverb: (v) => ramp(wet.gain, v * 0.5),
		reverbSize: (v) => {
			if (v !== s.reverbSize) convolver.buffer = reverbImpulse(ctx, v);
		},
		delay: (d) => {
			ramp(delay.delayTime, d.time);
			ramp(feedback.gain, d.feedback);
			ramp(delayReturn.gain, d.level);
			if (d.analog !== s.delay.analog) shaper.curve = shaperCurve(d.analog);
			ramp(damping.frequency, d.analog ? 2000 : 3200);
			ramp(wobble.gain.gain, d.analog ? 0.0015 : 0);
		},
		chorus: (c) => {
			ramp(chorusLfo.osc.frequency, c.rate);
			ramp(chorusLfo.gain.gain, c.depth * 0.004);
			ramp(chorusWet.gain, c.mix);
		},
		tremolo: (t) => {
			if (t.shape !== s.tremolo.shape) tremLfo.osc.type = t.shape;
			ramp(tremLfo.osc.frequency, t.rate);
			ramp(trem.gain, 1 - t.depth / 2);
			ramp(tremLfo.gain.gain, t.depth / 2);
		},
		fuzz: (f) => applyFuzz(f, RAMP),
		phaser: (p) => {
			ramp(phaserLfo.osc.frequency, p.rate);
			ramp(phaserLfo.gain.gain, p.depth * PHASER_SWEEP);
			ramp(phaserDry.gain, 1 - p.mix / 2);
			ramp(phaserWet.gain, p.mix / 2);
		},
		rotary: (r) => applyRotary(r, RAMP),
	};

	return {
		input,
		master,
		update(patch) {
			for (const key of Object.keys(patch) as (keyof PianoFxSettings)[]) {
				const value = patch[key];
				if (value === undefined) continue;
				// A nested setting merges over what stands, so a slider can send its one field.
				const merged =
					typeof value === "object" ? { ...(s[key] as object), ...(value as object) } : value;
				(apply[key] as (v: unknown) => void)(merged);
				(s as unknown as Record<string, unknown>)[key] = merged;
			}
		},
	};
}
