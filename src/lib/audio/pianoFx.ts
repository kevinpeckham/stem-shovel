import { reverbImpulse } from "./drumBus";
import { createDelayStage, createFuzzStage } from "./fxStages";

/**
 * The piano's effect chain (docs/piano.md, "Effects"), built once per
 * context and driven by `update`: voices play into `input`, which runs
 * through a fuzz (a hot gain into a soft clipper, a tone low-pass after),
 * a stereo chorus (two short delays swept by one LFO in opposite
 * directions, mixed against the dry signal), a phaser (four all-pass
 * stages swept by an LFO, mixed against the dry signal so notches move
 * through the sound) or in its place a flanger (a delay of a few
 * milliseconds swept by the LFO, with feedback, mixed the same way, so a
 * comb of notches sweeps instead), a tremolo (a gain swung by an LFO, sine or square)
 * and a rotary speaker (the sound split at 800 Hz into a horn and a drum,
 * each spun by its own LFO through pan, level and a Doppler delay, at a
 * slow or fast speed the LFOs glide between), into the dry bus; from the
 * dry bus, sends into a reverb (the drum machine's synthesized room) and
 * a delay (fxStages.ts, with its analog character), each returning into
 * `master`. Every level is a gain the setters ramp
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
	/** A phaser (swept all-pass notches) or a flanger (a short swept delay with feedback); one at a time, the sliders shared. */
	mode: "phaser" | "flanger";
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

/** The phaser's four all-pass stages, their centre frequencies and how far the LFO moves each. */
const PHASER_STAGES = [500, 800, 1300, 2100];
const PHASER_SWEEP = 400;
/** The flanger's delay: its centre, how far full depth sweeps it, and the feedback that sharpens the comb. */
const FLANGER_CENTRE = 0.003;
const FLANGER_SWEEP = 0.0025;
const FLANGER_FEEDBACK = 0.5;

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

	// Fuzz (fxStages.ts): a voice peaks near 0.3.
	const fuzz = createFuzzStage(ctx, 0.3);
	input.connect(fuzz.input);
	const fuzzOut = fuzz.output;
	fuzz.update(s.fuzz.drive, s.fuzz.tone, 0);

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

	// Phaser or flanger: `mix` crossfades from dry to half and half, where the notches are deepest
	// (an all-pass keeps the level, so the sum stays near it); the mode picks which wet is open.
	const phaserOut = ctx.createGain();
	const phaserDry = ctx.createGain();
	chorusOut.connect(phaserDry);
	phaserDry.connect(phaserOut);
	const phaserWet = ctx.createGain();
	const phaserLfo = lfo(ctx, s.phaser.rate, 1);
	// The phaser: four all-pass stages in series, swept together.
	const phaserSweep = ctx.createGain();
	phaserLfo.gain.connect(phaserSweep);
	let stage: AudioNode = chorusOut;
	for (const hz of PHASER_STAGES) {
		const ap = ctx.createBiquadFilter();
		ap.type = "allpass";
		ap.frequency.value = hz;
		ap.Q.value = 0.7;
		phaserSweep.connect(ap.frequency);
		stage.connect(ap);
		stage = ap;
	}
	stage.connect(phaserWet);
	phaserWet.connect(phaserOut);
	// The flanger: a delay around 3 ms swept by the same LFO, with feedback, in the other wet.
	const flangerWet = ctx.createGain();
	const flangerDelay = ctx.createDelay(0.05);
	flangerDelay.delayTime.value = FLANGER_CENTRE;
	const flangerSweep = ctx.createGain();
	phaserLfo.gain.connect(flangerSweep);
	flangerSweep.connect(flangerDelay.delayTime);
	const flangerFeedback = ctx.createGain();
	flangerFeedback.gain.value = FLANGER_FEEDBACK;
	chorusOut.connect(flangerDelay);
	flangerDelay.connect(flangerFeedback);
	flangerFeedback.connect(flangerDelay);
	flangerDelay.connect(flangerWet);
	flangerWet.connect(phaserOut);
	const applyPhaser = (p: PianoPhaserSettings, tau: number) => {
		const flanger = p.mode === "flanger";
		ramp(phaserLfo.osc.frequency, p.rate, tau);
		ramp(phaserSweep.gain, p.depth * PHASER_SWEEP, tau);
		ramp(flangerSweep.gain, p.depth * FLANGER_SWEEP, tau);
		ramp(phaserDry.gain, 1 - p.mix / 2, tau);
		ramp(phaserWet.gain, flanger ? 0 : p.mix / 2, tau);
		ramp(flangerWet.gain, flanger ? p.mix / 2 : 0, tau);
	};
	applyPhaser(s.phaser, 0);

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

	const delay = createDelayStage(ctx, 1);
	dry.connect(delay.input);
	delay.output.connect(master);
	delay.update(s.delay, 0);

	const apply: { [K in keyof PianoFxSettings]: (v: PianoFxSettings[K]) => void } = {
		volume: (v) => ramp(master.gain, v),
		reverb: (v) => ramp(wet.gain, v * 0.5),
		reverbSize: (v) => {
			if (v !== s.reverbSize) convolver.buffer = reverbImpulse(ctx, v);
		},
		delay: (d) => delay.update(d, RAMP),
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
		fuzz: (f) => fuzz.update(f.drive, f.tone, RAMP),
		phaser: (p) => applyPhaser(p, RAMP),
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
