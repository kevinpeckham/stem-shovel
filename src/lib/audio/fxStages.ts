/**
 * Effect stages the piano's chain (pianoFx.ts) and the drum bus
 * (drumBus.ts) share: a fuzz and a delay with an analog character. Plain
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
