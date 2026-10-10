/**
 * Effect stages the piano's chain (pianoFx.ts), the drum bus
 * (drumBus.ts), the Studio's track chain and the Practice Amp
 * (ampChain.ts) share: a fuzz and an overdrive, a delay with an analog
 * character, a wah, a tone stage (a tilt, an exciter and a low-end
 * enhancer), a compressor, a chorus, a phaser or flanger, a tremolo and a
 * rotary speaker. Plain
 * Web Audio on a BaseAudioContext, so the offline renders carry them.
 * Levels move by `setTargetAtTime` with the time constant the caller
 * gives: 20 ms from a slider so nothing clicks, 0 to land at once.
 */

export interface FuzzStage {
	input: AudioNode;
	output: AudioNode;
	/** Drive 0 (off, the dry passes) to 1; tone 0 dark to 1 bright. */
	update(drive: number, tone: number, tau: number): void;
}

export interface DelayStageSettings {
	/** Seconds. */
	time: number;
	feedback: number;
	/** The return level; 0 is off. */
	level: number;
	/** Tape-like repeats: a soft clip in the loop, a darker damping, a slow wobble of the time. */
	analog: boolean;
}
export interface DelayStage {
	input: AudioNode;
	output: AudioNode;
	update(settings: DelayStageSettings, tau: number): void;
}

function curve(f: (x: number) => number): Float32Array<ArrayBuffer> {
	const n = 2048;
	const out = new Float32Array(new ArrayBuffer(n * 4));
	for (let i = 0; i < n; i++) out[i] = f((i / (n - 1)) * 2 - 1);
	return out;
}
/**
 * The analog delay's loop: a gentle soft clip, unity at small signals so
 * the feedback stays what the slider says, the peaks folding down as tape
 * saturates. Identity for the digital one.
 */
const LOOP_CURVE = { analog: curve((x) => Math.tanh(x * 1.6) / 1.6), digital: curve((x) => x) };
const DAMPING_HZ = { analog: 2000, digital: 3200 };
const WOBBLE_HZ = 0.4;
const WOBBLE_SECONDS = 0.0015;

/** The fuzz's clipper: a tanh the drive gain pushes towards a square. */
const FUZZ_CURVE = curve((x) => Math.tanh(x));
/** The overdrive's: a cubic that bends gently and flattens at the top (a tube screamer's shape), unity at small signals. */
const OVERDRIVE_CURVE = curve((x) =>
	Math.abs(x) < 1 ? 1.5 * (x - (x * x * x) / 3) : Math.sign(x),
);
const fuzzPre = (drive: number) => 1 + drive * 30;
const fuzzTone = (tone: number) => 700 * 10 ** tone; // 700 Hz to 7 kHz

export interface ClipStageOptions {
	/** The clipper's shape, over −1 to 1, and `f`, the same shape as a function, for the make-up. */
	curve: Float32Array<ArrayBuffer>;
	f: (x: number) => number;
	/** The gain before the clipper at a drive of 0 to 1. */
	pre: (drive: number) => number;
	/** The low-pass after it at a tone of 0 (dark) to 1 (bright), in Hz. */
	tone: (tone: number) => number;
	/** A high-pass before the clipper on the wet path (the overdrive tightens the lows); none without. */
	highPassHz?: number;
	/** The wet's level once fully in, against the dry's. */
	wet?: number;
}

/**
 * A clipping pedal: a gain of `pre(drive)` into a WaveShaper (4×
 * oversampled), a low-pass after it for the tone, and a make-up that
 * holds the peaks where the clean sound's were: a signal peaking near
 * `peak` comes out of the clipper at f(peak · gain), so the make-up
 * divides by that (measured on the piano within 1 dB of clean at every
 * drive). The wet crossfades in over the first quarter of the drive's
 * travel. The fuzz and the overdrive are two shapes of it.
 */
export function createClipStage(
	ctx: BaseAudioContext,
	peak: number,
	o: ClipStageOptions,
): FuzzStage {
	const input = ctx.createGain();
	const output = ctx.createGain();
	const dry = ctx.createGain();
	const pre = ctx.createGain();
	const shaper = ctx.createWaveShaper();
	shaper.curve = o.curve;
	shaper.oversample = "4x";
	const tone = ctx.createBiquadFilter();
	tone.type = "lowpass";
	const wet = ctx.createGain();
	input.connect(dry);
	dry.connect(output);
	let into: AudioNode = input;
	if (o.highPassHz) {
		const hp = ctx.createBiquadFilter();
		hp.type = "highpass";
		hp.frequency.value = o.highPassHz;
		hp.Q.value = 0.7;
		input.connect(hp);
		into = hp;
	}
	into.connect(pre);
	pre.connect(shaper);
	shaper.connect(tone);
	tone.connect(wet);
	wet.connect(output);
	const wetLevel = o.wet ?? 0.9;
	const set = (param: AudioParam, value: number, tau: number) =>
		tau ? param.setTargetAtTime(value, ctx.currentTime, tau) : (param.value = value);
	return {
		input,
		output,
		update(drive, toneAmount, tau) {
			const amount = Math.min(1, drive * 4);
			set(dry.gain, 1 - amount, tau);
			set(pre.gain, o.pre(drive), tau);
			set(tone.frequency, o.tone(toneAmount), tau);
			set(wet.gain, (amount * wetLevel * peak) / o.f(peak * o.pre(drive)), tau);
		},
	};
}

/** A fuzz: a gain of 1 + 30·drive into a `tanh`, the tone from 700 Hz to 7 kHz (createClipStage). */
export function createFuzzStage(ctx: BaseAudioContext, peak: number): FuzzStage {
	return createClipStage(ctx, peak, {
		curve: FUZZ_CURVE,
		f: Math.tanh,
		pre: fuzzPre,
		tone: fuzzTone,
	});
}

/**
 * An overdrive, softer than the fuzz: the lows under 250 Hz left out of
 * the clipper (so a chord stays tight), a gain of 1 + 12·drive into the
 * cubic, the tone from 1 to 6 kHz.
 */
export function createOverdriveStage(ctx: BaseAudioContext, peak: number): FuzzStage {
	return createClipStage(ctx, peak, {
		curve: OVERDRIVE_CURVE,
		f: (x) => (Math.abs(x) < 1 ? 1.5 * (x - (x * x * x) / 3) : Math.sign(x)),
		pre: (drive) => 1 + drive * 12,
		tone: (tone) => 1000 * 6 ** tone,
		highPassHz: 250,
	});
}

/**
 * A delay: input → delay → loop shaper → damping → feedback → delay, the
 * delay into a return gain into the output. The drum machine's shape, with
 * the analog character switchable: the soft clip in the loop, a darker
 * damping (2 kHz against 3.2) and a 0.4 Hz wobble of ±1.5 ms on the time.
 * Measured on a 500 Hz + 3 kHz burst, the second analog repeat's 3 kHz
 * sits 20 dB under the digital one's and the tail dies sooner, so a
 * longer analog tail wants more feedback.
 */
export function createDelayStage(ctx: BaseAudioContext, maxSeconds: number): DelayStage {
	const input = ctx.createGain();
	const output = ctx.createGain();
	const delay = ctx.createDelay(maxSeconds + 0.1);
	const shaper = ctx.createWaveShaper();
	shaper.curve = LOOP_CURVE.digital;
	const damping = ctx.createBiquadFilter();
	damping.type = "lowpass";
	damping.frequency.value = DAMPING_HZ.digital;
	const feedback = ctx.createGain();
	input.connect(delay);
	delay.connect(shaper);
	shaper.connect(damping);
	damping.connect(feedback);
	feedback.connect(delay);
	delay.connect(output);
	const wobble = ctx.createOscillator();
	wobble.frequency.value = WOBBLE_HZ;
	const wobbleDepth = ctx.createGain();
	wobbleDepth.gain.value = 0;
	wobble.connect(wobbleDepth);
	wobbleDepth.connect(delay.delayTime);
	wobble.start();
	let analog = false;
	const set = (param: AudioParam, value: number, tau: number) =>
		tau ? param.setTargetAtTime(value, ctx.currentTime, tau) : (param.value = value);
	return {
		input,
		output,
		update(s, tau) {
			set(delay.delayTime, Math.min(maxSeconds, s.time), tau);
			set(feedback.gain, s.feedback, tau);
			set(output.gain, s.level, tau);
			if (s.analog !== analog) {
				analog = s.analog;
				shaper.curve = analog ? LOOP_CURVE.analog : LOOP_CURVE.digital;
			}
			set(damping.frequency, analog ? DAMPING_HZ.analog : DAMPING_HZ.digital, tau);
			set(wobbleDepth.gain, analog ? WOBBLE_SECONDS : 0, tau);
		},
	};
}

export interface WahStageSettings {
	/** Touch: an envelope follower opens the filter with the signal; Sweep: an LFO moves it. */
	mode: "touch" | "sweep";
	/** Touch: how far a signal opens it, 0 to 1. */
	sensitivity: number;
	/** Sweep: Hz. */
	rate: number;
	/** How far the filter can travel above its floor, 0 to 1. */
	range: number;
	/** The peak at the cutoff, 0 to 1 of `maxResonanceDb`. */
	resonance: number;
	/** Wet level, 0 (off) to 1. */
	mix: number;
}
export interface WahStage {
	input: AudioNode;
	output: AudioNode;
	update(settings: WahStageSettings, tau: number): void;
	/** A pedal's position, 0 to 1, drives the filter in place of touch or sweep; null hands it back. */
	pedal(position: number | null): void;
}

/**
 * The wah's filter: a resonant low-pass (a band-pass threw away 19 dB;
 * this keeps the body and moves a peak, the vowel of a wah pedal), its
 * cutoff at a floor plus up to WAH_SPAN × range, moved by whichever of
 * three summed sources the mode opens: an envelope follower (the signal
 * rectified by a WaveShaper, smoothed by a 6 Hz low-pass, into a gain the
 * sensitivity sets), an LFO sitting mid-travel, or a pedal (a
 * ConstantSourceNode). Resonance is the BiquadFilter's Q, which for a
 * low-pass is in decibels, 0 to `maxResonanceDb`; the wet is trimmed to
 * 0.7 to leave that peak room (measured on the piano within 1 dB of dry),
 * and `makeupDb` lifts it back where a caller finds the wet too quiet.
 * `peak` is what the signal peaks near (a voice 0.3, a drum hit 0.8): the
 * follower's gain is scaled so full sensitivity reaches the top.
 */
const WAH_FLOOR = 350;
const WAH_SPAN = 1800;
const WAH_WET = 0.7;
const WAH_FOLLOW_HZ = 6;
const ABS_CURVE = curve((x) => Math.abs(x));

export function createWahStage(
	ctx: BaseAudioContext,
	peak: number,
	maxResonanceDb: number,
	/** Gain compensation at full mix, in dB, scaled with the mix: a low-pass over drums reads quieter as it closes (Kevin), so the drum bus lifts the wet. */
	makeupDb = 0,
): WahStage {
	const input = ctx.createGain();
	const output = ctx.createGain();
	const dry = ctx.createGain();
	input.connect(dry);
	dry.connect(output);
	const filter = ctx.createBiquadFilter();
	filter.type = "lowpass";
	filter.frequency.value = WAH_FLOOR;
	const wet = ctx.createGain();
	input.connect(filter);
	filter.connect(wet);
	wet.connect(output);
	const rectifier = ctx.createWaveShaper();
	rectifier.curve = ABS_CURVE;
	const smoother = ctx.createBiquadFilter();
	smoother.type = "lowpass";
	smoother.frequency.value = WAH_FOLLOW_HZ;
	smoother.Q.value = 0.5;
	const follow = ctx.createGain();
	follow.gain.value = 0;
	input.connect(rectifier);
	rectifier.connect(smoother);
	smoother.connect(follow);
	follow.connect(filter.frequency);
	const lfo = ctx.createOscillator();
	lfo.frequency.value = 1;
	const lfoGain = ctx.createGain();
	lfoGain.gain.value = 0;
	lfo.connect(lfoGain);
	lfoGain.connect(filter.frequency);
	lfo.start();
	const pedal = ctx.createConstantSource();
	pedal.offset.value = 0;
	const pedalGain = ctx.createGain();
	pedalGain.gain.value = 0;
	pedal.connect(pedalGain);
	pedalGain.connect(filter.frequency);
	pedal.start();
	// A signal peaking at `peak` rectifies to about half that at the smoother; this brings full sensitivity to the top of the range.
	const followGain = 2 / peak;
	let pedalDown = false;
	let last: WahStageSettings | null = null;
	const set = (param: AudioParam, value: number, tau: number) =>
		tau ? param.setTargetAtTime(value, ctx.currentTime, tau) : (param.value = value);
	const apply = (w: WahStageSettings, tau: number) => {
		last = w;
		const span = w.range * WAH_SPAN;
		const touch = !pedalDown && w.mode === "touch";
		const sweep = !pedalDown && w.mode === "sweep";
		// Sweep sits in the middle of its travel and swings ±half; touch and the pedal start at the floor.
		set(filter.frequency, WAH_FLOOR + (sweep ? span / 2 : 0), tau);
		set(filter.Q, w.resonance * maxResonanceDb, tau);
		set(follow.gain, touch ? w.sensitivity * followGain * span : 0, tau);
		set(lfo.frequency, w.rate, tau);
		set(lfoGain.gain, sweep ? span / 2 : 0, tau);
		set(pedalGain.gain, pedalDown ? span : 0, tau);
		set(dry.gain, 1 - w.mix, tau);
		set(wet.gain, w.mix * WAH_WET * 10 ** ((makeupDb * w.mix) / 20), tau);
	};
	return {
		input,
		output,
		update: apply,
		pedal(position) {
			const down = position !== null;
			if (down !== pedalDown) {
				pedalDown = down;
				if (last) apply(last, 0.02);
			}
			if (down) set(pedal.offset, Math.min(1, Math.max(0, position)), 0.02);
		},
	};
}

export interface ToneStageSettings {
	/** -1 dark to 1 bright, 0 flat: a low shelf and a high shelf moving opposite ways, up to 6 dB each. */
	tilt: number;
	/** The exciter, 0 (off) to 1: harmonics made above 3 kHz, mixed back in. */
	air: number;
	/** The low-end enhancer, 0 (off) to 1: the band under 100 Hz compressed and mixed back in. */
	bottom: number;
}
export interface ToneStage {
	input: AudioNode;
	output: AudioNode;
	update(settings: ToneStageSettings, tau: number): void;
}

/**
 * Tone (Kevin's ask, 2026-10-01), on the master of both instruments:
 *
 * - **Tilt**: a low shelf at 250 Hz and a high shelf at 2.5 kHz, their
 *   gains opposite (±6 dB at the ends), in series on the signal: one slider
 *   from dark to bright, flat in the middle.
 * - **Air**, an exciter after Aphex's Aural Exciter: the signal above 2 kHz
 *   into a hot gain and a tanh WaveShaper (4× oversampled), which makes new
 *   harmonics above what was there, then a 4 kHz high-pass so only the new
 *   content comes back, mixed in at up to a quarter. Brightens by adding
 *   what a shelf cannot: harmonics above the sound's own top. (It needs
 *   something in the band to work from: a sound low-passed at 2 kHz gains
 *   nothing, measured; one with a top end gains a sparkle.)
 * - **Bottom**, after the intent of the same unit's Big Bottom: bass that
 *   feels bigger. Aphex does it with a phase shift and a compressor on the
 *   low band; a Web Audio compressor has a few milliseconds of lookahead,
 *   and mixing the delayed band back cancelled as much as it added
 *   (measured). A harmonic enhancer read as brightness and grit (Kevin); a
 *   parallel sub band lost most of itself to the filters' phase lag; a
 *   Linkwitz-Riley crossover summed flat but its phase rotation put a
 *   sawtooth's peaks up 5 dB before any boost (all measured). So it is a
 *   subtractive split: the output is the signal, minus its low band (a
 *   100 Hz low-pass), plus that band boosted by up to 6 dB through a gentle
 *   tanh that folds its peaks. At zero the band is added back as it was and
 *   the output is the signal bit for bit; above zero only the band's
 *   increase is added, in phase with it, so the fundamental gains weight
 *   and the peaks grow by the boost and no more.
 */
const TILT_DB = 6;
const AIR_WET = 0.25;
/** The low band's boost at full Bottom, as a gain: 2.5 is +8 dB on the band, about +5 dB at the fundamental once the band's phase lag is summed in. */
const BOTTOM_BOOST = 2.5;
const EXCITER_CURVE = curve((x) => Math.tanh(x));
/** The low band's shaper: tanh scaled to unity at small signals, so the boost is a boost and only the loudest peaks fold. */
const SUB_CURVE = curve((x) => Math.tanh(x * 0.8) / 0.8);

export function createToneStage(ctx: BaseAudioContext): ToneStage {
	const input = ctx.createGain();
	const output = ctx.createGain();
	// Tilt, in series.
	const low = ctx.createBiquadFilter();
	low.type = "lowshelf";
	low.frequency.value = 250;
	const high = ctx.createBiquadFilter();
	high.type = "highshelf";
	high.frequency.value = 2500;
	input.connect(low);
	low.connect(high);
	// Air.
	const airHp = ctx.createBiquadFilter();
	airHp.type = "highpass";
	airHp.frequency.value = 2000;
	airHp.Q.value = 0.7;
	const airPre = ctx.createGain();
	airPre.gain.value = 6;
	const airShaper = ctx.createWaveShaper();
	airShaper.curve = EXCITER_CURVE;
	airShaper.oversample = "4x";
	const airPost = ctx.createBiquadFilter();
	airPost.type = "highpass";
	airPost.frequency.value = 4000;
	airPost.Q.value = 0.7;
	const airGain = ctx.createGain();
	airGain.gain.value = 0;
	high.connect(airHp);
	airHp.connect(airPre);
	airPre.connect(airShaper);
	airShaper.connect(airPost);
	airPost.connect(airGain);
	airGain.connect(output);
	// Bottom: output = signal − low band + processed low band (the band as it was at zero, boosted and warmed above).
	high.connect(output);
	const band = ctx.createBiquadFilter();
	band.type = "lowpass";
	band.frequency.value = 100;
	band.Q.value = -6.02; // Q 0.5 (a low-pass's Q is in dB)
	high.connect(band);
	const lowNeg = ctx.createGain();
	lowNeg.gain.value = -1;
	band.connect(lowNeg);
	lowNeg.connect(output);
	const bottomBoost = ctx.createGain();
	bottomBoost.gain.value = 1;
	band.connect(bottomBoost);
	const lowPlain = ctx.createGain();
	lowPlain.gain.value = 1;
	bottomBoost.connect(lowPlain);
	lowPlain.connect(output);
	const bottomShaper = ctx.createWaveShaper();
	bottomShaper.curve = SUB_CURVE;
	// No oversampling: it carries a resampling delay that put the band out of phase with the signal it is added to (measured, 11 dB of cancellation at 55 Hz), and a band under 100 Hz has nothing to alias.
	bottomShaper.oversample = "none";
	const lowWarm = ctx.createGain();
	lowWarm.gain.value = 0;
	bottomBoost.connect(bottomShaper);
	bottomShaper.connect(lowWarm);
	lowWarm.connect(output);
	const set = (param: AudioParam, value: number, tau: number) =>
		tau ? param.setTargetAtTime(value, ctx.currentTime, tau) : (param.value = value);
	return {
		input,
		output,
		update(t, tau) {
			const tilt = Math.min(1, Math.max(-1, t.tilt));
			set(low.gain, -tilt * TILT_DB, tau);
			set(high.gain, tilt * TILT_DB, tau);
			set(airGain.gain, Math.min(1, Math.max(0, t.air)) * AIR_WET, tau);
			const bottom = Math.min(1, Math.max(0, t.bottom));
			set(bottomBoost.gain, 1 + bottom * (BOTTOM_BOOST - 1), tau);
			set(lowPlain.gain, bottom > 0 ? 0 : 1, tau);
			set(lowWarm.gain, bottom > 0 ? 1 : 0, tau);
		},
	};
}

export interface CompressorStageSettings {
	/** 0 (bypassed: the signal goes round the node) to 1 (the threshold at −40 dB). */
	amount: number;
	ratio: number;
	attack: number;
	release: number;
	/** Make-up gain in dB, applied while on. */
	makeup: number;
}
export interface CompressorStage {
	input: AudioNode;
	output: AudioNode;
	update(settings: CompressorStageSettings, tau: number): void;
	/** The gain reduction now in dB (0 or below), and the threshold and ratio in force, for a meter. */
	meters(): { reduction: number; threshold: number; ratio: number };
}

/**
 * A compressor with a true off: the browser's DynamicsCompressor still
 * squeezes a few dB with its threshold at 0 dB and its ratio at 1:1
 * (measured), so at amount 0 the signal crossfades round the node
 * instead. The threshold goes to −40 dB at full amount, with make-up gain
 * after it. The piano's, the Studio track's and the amp's compressor.
 */
export function createCompressorStage(ctx: BaseAudioContext): CompressorStage {
	const input = ctx.createGain();
	const output = ctx.createGain();
	const comp = ctx.createDynamicsCompressor();
	comp.knee.value = 6;
	const makeup = ctx.createGain();
	const dry = ctx.createGain();
	input.connect(comp);
	comp.connect(makeup);
	makeup.connect(output);
	input.connect(dry);
	dry.connect(output);
	const set = (param: AudioParam, value: number, tau: number) =>
		tau ? param.setTargetAtTime(value, ctx.currentTime, tau) : (param.value = value);
	return {
		input,
		output,
		update(c, tau) {
			const on = c.amount > 0;
			set(comp.threshold, -40 * c.amount, tau);
			set(comp.ratio, c.ratio, tau);
			comp.attack.value = c.attack;
			comp.release.value = c.release;
			set(makeup.gain, on ? Math.pow(10, c.makeup / 20) : 0, tau);
			set(dry.gain, on ? 0 : 1, tau);
		},
		meters: () => ({
			reduction: comp.reduction,
			threshold: comp.threshold.value,
			ratio: comp.ratio.value,
		}),
	};
}

/** An oscillator started now, into a gain: the LFO and the gain that scales it. */
export function lfo(
	ctx: BaseAudioContext,
	hz: number,
	amount: number,
	type: OscillatorType = "sine",
) {
	const osc = ctx.createOscillator();
	osc.type = type;
	osc.frequency.value = hz;
	const gain = ctx.createGain();
	gain.gain.value = amount;
	osc.connect(gain);
	osc.start();
	return { osc, gain };
}

export interface ChorusStageSettings {
	/** The sweep's rate in Hz (0.1 to 5). */
	rate: number;
	/** How far the sweep goes, 0 to 1 (±4 ms). */
	depth: number;
	/** The wet level, 0 (off) to 1; the dry passes at full. */
	mix: number;
}
export interface ChorusStage {
	input: AudioNode;
	output: AudioNode;
	update(settings: ChorusStageSettings, tau: number): void;
}

/** A chorus: the dry through at full, two delays (22 and 28 ms) swept opposite ways by one LFO and panned apart, at `mix`. */
export function createChorusStage(ctx: BaseAudioContext): ChorusStage {
	const input = ctx.createGain();
	const output = ctx.createGain();
	input.connect(output);
	const wet = ctx.createGain();
	wet.gain.value = 0;
	const sweep = lfo(ctx, 0.8, 0);
	const inv = ctx.createGain();
	inv.gain.value = -1;
	sweep.gain.connect(inv);
	for (const [base, pan, mod] of [
		[0.022, -0.6, sweep.gain],
		[0.028, 0.6, inv],
	] as const) {
		const d = ctx.createDelay(0.1);
		d.delayTime.value = base;
		mod.connect(d.delayTime);
		const p = ctx.createStereoPanner();
		p.pan.value = pan;
		input.connect(d);
		d.connect(p);
		p.connect(wet);
	}
	wet.connect(output);
	const set = (param: AudioParam, value: number, tau: number) =>
		tau ? param.setTargetAtTime(value, ctx.currentTime, tau) : (param.value = value);
	return {
		input,
		output,
		update(c, tau) {
			set(sweep.osc.frequency, c.rate, tau);
			set(sweep.gain.gain, c.depth * 0.004, tau);
			set(wet.gain, c.mix, tau);
		},
	};
}

export interface PhaserStageSettings {
	/** A phaser (swept all-pass notches) or a flanger (a short swept delay with feedback), sharing the sliders. */
	mode: "phaser" | "flanger";
	/** The sweep's rate in Hz (0.1 to 5). */
	rate: number;
	/** How far the notches sweep, 0 to 1. */
	depth: number;
	/** The wet level, 0 (off) to 1: crossfades from dry to half and half, where the notches are deepest. */
	mix: number;
}
export interface PhaserStage {
	input: AudioNode;
	output: AudioNode;
	update(settings: PhaserStageSettings, tau: number): void;
}

/** The phaser's four all-pass stages, their centre frequencies and how far the LFO moves each. */
const PHASER_STAGES = [500, 800, 1300, 2100];
const PHASER_SWEEP = 400;
/** The flanger's delay: its centre, how far full depth sweeps it, and the feedback that sharpens the comb. */
const FLANGER_CENTRE = 0.003;
const FLANGER_SWEEP = 0.0025;
const FLANGER_FEEDBACK = 0.5;

/**
 * A phaser or a flanger: `mix` crossfades from dry to half and half (an
 * all-pass keeps the level, so the sum stays near it); the mode picks
 * which wet is open. The phaser is four all-pass stages in series swept
 * together; the flanger a delay around 3 ms swept by the same LFO, with
 * feedback.
 */
export function createPhaserStage(ctx: BaseAudioContext): PhaserStage {
	const input = ctx.createGain();
	const output = ctx.createGain();
	const dry = ctx.createGain();
	input.connect(dry);
	dry.connect(output);
	const phaserWet = ctx.createGain();
	phaserWet.gain.value = 0;
	const sweep = lfo(ctx, 0.5, 1);
	const phaserSweep = ctx.createGain();
	phaserSweep.gain.value = 0;
	sweep.gain.connect(phaserSweep);
	let stage: AudioNode = input;
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
	phaserWet.connect(output);
	const flangerWet = ctx.createGain();
	flangerWet.gain.value = 0;
	const flangerDelay = ctx.createDelay(0.05);
	flangerDelay.delayTime.value = FLANGER_CENTRE;
	const flangerSweep = ctx.createGain();
	flangerSweep.gain.value = 0;
	sweep.gain.connect(flangerSweep);
	flangerSweep.connect(flangerDelay.delayTime);
	const flangerFeedback = ctx.createGain();
	flangerFeedback.gain.value = FLANGER_FEEDBACK;
	input.connect(flangerDelay);
	flangerDelay.connect(flangerFeedback);
	flangerFeedback.connect(flangerDelay);
	flangerDelay.connect(flangerWet);
	flangerWet.connect(output);
	const set = (param: AudioParam, value: number, tau: number) =>
		tau ? param.setTargetAtTime(value, ctx.currentTime, tau) : (param.value = value);
	return {
		input,
		output,
		update(p, tau) {
			const flanger = p.mode === "flanger";
			set(sweep.osc.frequency, p.rate, tau);
			set(phaserSweep.gain, p.depth * PHASER_SWEEP, tau);
			set(flangerSweep.gain, p.depth * FLANGER_SWEEP, tau);
			set(dry.gain, 1 - p.mix / 2, tau);
			set(phaserWet.gain, flanger ? 0 : p.mix / 2, tau);
			set(flangerWet.gain, flanger ? p.mix / 2 : 0, tau);
		},
	};
}

export interface TremoloStageSettings {
	/** The swing's rate in Hz (0.5 to 12). */
	rate: number;
	/** How deep the swing goes, 0 (off) to 1 (down to silence). */
	depth: number;
	shape: "sine" | "square";
}
export interface TremoloStage {
	input: AudioNode;
	output: AudioNode;
	update(settings: TremoloStageSettings, tau: number): void;
}

/**
 * A tremolo: the gain sits at 1 − depth/2 and the LFO swings it by
 * ±depth/2. The LFO passes a low-pass on its way so a square's edges take
 * a few milliseconds: an instant step in the level is a click on a
 * sustained note (Kevin heard a crunch on the Electric Piano).
 */
export function createTremoloStage(ctx: BaseAudioContext): TremoloStage {
	const input = ctx.createGain();
	const output = ctx.createGain();
	const trem = ctx.createGain();
	trem.gain.value = 1;
	const swing = lfo(ctx, 5, 0);
	const smooth = ctx.createBiquadFilter();
	smooth.type = "lowpass";
	smooth.frequency.value = 80;
	smooth.Q.value = 0.5;
	swing.gain.connect(smooth);
	smooth.connect(trem.gain);
	input.connect(trem);
	trem.connect(output);
	let shape: OscillatorType = "sine";
	const set = (param: AudioParam, value: number, tau: number) =>
		tau ? param.setTargetAtTime(value, ctx.currentTime, tau) : (param.value = value);
	return {
		input,
		output,
		update(t, tau) {
			if (t.shape !== shape) {
				shape = t.shape;
				swing.osc.type = shape;
			}
			set(swing.osc.frequency, t.rate, tau);
			set(trem.gain, 1 - t.depth / 2, tau);
			set(swing.gain.gain, t.depth / 2, tau);
		},
	};
}

export type RotarySpeed = "off" | "slow" | "fast";
export interface RotaryStage {
	input: AudioNode;
	output: AudioNode;
	update(speed: RotarySpeed, tau: number): void;
}

/** The rotary speaker's rotation rates in Hz, horn and drum, at each speed (a Leslie's: the drum lags the horn). */
const ROTARY_HZ: Record<RotarySpeed, readonly [number, number]> = {
	off: [0, 0],
	slow: [0.8, 0.7],
	fast: [6.7, 5.7],
};
/** The two bands overlap at the crossover, so the wet is trimmed to sit at the dry's loudness (measured on a 300 Hz and a 1.5 kHz tone). */
const ROTARY_TRIM = 0.8;

/**
 * A rotary speaker: horn above 800 Hz and drum below, each spun by its
 * own LFO (opposite ways) through a Doppler delay, a level swing and the
 * pan. The rotors glide to a new speed, the horn in about a second, the
 * heavier drum in two; off lets them coast down.
 */
export function createRotaryStage(ctx: BaseAudioContext): RotaryStage {
	const input = ctx.createGain();
	const output = ctx.createGain();
	const dry = ctx.createGain();
	input.connect(dry);
	dry.connect(output);
	const wet = ctx.createGain();
	wet.gain.value = 0;
	wet.connect(output);
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
		input.connect(split);
		split.connect(delay);
		delay.connect(level);
		level.connect(pan);
		pan.connect(wet);
		return spin.osc;
	});
	const set = (param: AudioParam, value: number, tau: number) =>
		tau ? param.setTargetAtTime(value, ctx.currentTime, tau) : (param.value = value);
	return {
		input,
		output,
		update(speed, tau) {
			const on = speed !== "off";
			set(dry.gain, on ? 0 : 1, tau);
			set(wet.gain, on ? ROTARY_TRIM : 0, tau);
			const [horn, drum] = ROTARY_HZ[speed];
			set(rotors[0]!.frequency, horn, tau && 0.5);
			set(rotors[1]!.frequency, drum, tau && 1);
		},
	};
}
