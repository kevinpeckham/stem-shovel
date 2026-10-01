/**
 * Effect stages the piano's chain (pianoFx.ts) and the drum bus
 * (drumBus.ts) share: a fuzz, a delay with an analog character, and a wah. Plain
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
const fuzzPre = (drive: number) => 1 + drive * 30;
const fuzzTone = (tone: number) => 700 * 10 ** tone; // 700 Hz to 7 kHz

/**
 * A fuzz: a gain of 1 + 30·drive into a `tanh` WaveShaper (4× oversampled),
 * a low-pass after it for the tone, and a make-up that holds the peaks
 * where the clean sound's were: a signal peaking near `peak` comes out of
 * the clipper at tanh(peak · gain), so the make-up divides by that
 * (measured on the piano within 1 dB of clean at every drive). The wet
 * crossfades in over the first quarter of the drive's travel.
 */
export function createFuzzStage(ctx: BaseAudioContext, peak: number): FuzzStage {
	const input = ctx.createGain();
	const output = ctx.createGain();
	const dry = ctx.createGain();
	const pre = ctx.createGain();
	const shaper = ctx.createWaveShaper();
	shaper.curve = FUZZ_CURVE;
	shaper.oversample = "4x";
	const tone = ctx.createBiquadFilter();
	tone.type = "lowpass";
	const wet = ctx.createGain();
	input.connect(dry);
	dry.connect(output);
	input.connect(pre);
	pre.connect(shaper);
	shaper.connect(tone);
	tone.connect(wet);
	wet.connect(output);
	const set = (param: AudioParam, value: number, tau: number) =>
		tau ? param.setTargetAtTime(value, ctx.currentTime, tau) : (param.value = value);
	return {
		input,
		output,
		update(drive, toneAmount, tau) {
			const amount = Math.min(1, drive * 4);
			set(dry.gain, 1 - amount, tau);
			set(pre.gain, fuzzPre(drive), tau);
			set(tone.frequency, fuzzTone(toneAmount), tau);
			set(wet.gain, (amount * 0.9 * peak) / Math.tanh(peak * fuzzPre(drive)), tau);
		},
	};
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
