import { AMP_MID_FREQUENCIES, type AmpHead } from "#lib/val/AmpSchema.js";
import type { AmpCabinetId, AmpModel, AmpPreampCurve } from "#lib/constants/amp.js";
import { cabinetImpulseSamples } from "#lib/utils/cabinetImpulse.js";
import { springImpulseSamples } from "#lib/utils/springImpulse.js";

/**
 * The Practice Amp's own stages (docs/practice-amp.md): the preamp, the
 * tone stack, the power stage, the cabinet, the spring and the gate.
 * Plain Web Audio on a BaseAudioContext, like fxStages.ts, so the chain
 * renders offline for a test or a re-amp. Levels move by
 * `setTargetAtTime` with the time constant the caller gives.
 */
const N = 2048;
function curve(f: (x: number) => number): Float32Array<ArrayBuffer> {
	const out = new Float32Array(new ArrayBuffer(N * 4));
	for (let i = 0; i < N; i++) out[i] = f((i / (N - 1)) * 2 - 1);
	return out;
}
const set = (ctx: BaseAudioContext, param: AudioParam, value: number, tau: number) =>
	tau ? param.setTargetAtTime(value, ctx.currentTime, tau) : (param.value = value);

/**
 * The preamp shapes: a clean stage is a tanh with a small bias (even
 * harmonics, as a single-ended tube stage makes them); the tweed clips
 * the top of the wave sooner than the bottom; the bass tube stage is the
 * clean one with the fundamentals kept beside it; the solid-state one is
 * a cubic that goes flat, which is what a clipping op-amp does.
 */
const PREAMP_SHAPES: Record<AmpPreampCurve, (x: number) => number> = {
	clean: (x) => Math.tanh(x + 0.15) - Math.tanh(0.15),
	tweed: (x) => (x >= 0 ? Math.tanh(1.3 * x) / 1.3 : Math.tanh(0.7 * x) / 0.7),
	tube: (x) => Math.tanh(x + 0.08) - Math.tanh(0.08),
	solid: (x) => (Math.abs(x) < 1 ? 1.5 * (x - (x * x * x) / 3) : Math.sign(x)),
};
const PREAMP_CURVES = Object.fromEntries(
	Object.entries(PREAMP_SHAPES).map(([k, f]) => [k, curve(f)]),
) as Record<AmpPreampCurve, Float32Array<ArrayBuffer>>;
/** The power stage's clip: softer than any preamp, 4× oversampled. */
const POWER_SHAPE = (x: number) => Math.tanh(0.7 * x) / 0.7;
const POWER_CURVE = curve(POWER_SHAPE);
const ABS_CURVE = curve((x) => Math.abs(x));

export interface AmpStage {
	input: AudioNode;
	output: AudioNode;
	update(model: AmpModel, head: AmpHead, tau: number): void;
}

/**
 * The preamp: a high-pass (what the stage will not bother distorting),
 * the signal split so the bass heads' fundamentals pass beside the
 * clipper, a gain of 1 + drive·gain into the model's curve, a low-pass
 * for the stage's own top end, and a make-up that holds most of the
 * level (three quarters of it, so the gain knob still gets louder as a
 * real one does). `peak` is what the input peaks near after the trim.
 */
export function createPreampStage(ctx: BaseAudioContext, peak: number): AmpStage {
	const input = ctx.createGain();
	const output = ctx.createGain();
	const hp = ctx.createBiquadFilter();
	hp.type = "highpass";
	hp.Q.value = 0.7;
	input.connect(hp);
	// The lows kept clean (the bass heads): a low-pass beside the clipper, open or shut.
	const lows = ctx.createBiquadFilter();
	lows.type = "lowpass";
	lows.Q.value = -3; // Q 0.7 (a low-pass's Q is in dB)
	const lowsGain = ctx.createGain();
	lowsGain.gain.value = 0;
	hp.connect(lows);
	lows.connect(lowsGain);
	lowsGain.connect(output);
	const highs = ctx.createBiquadFilter();
	highs.type = "highpass";
	highs.Q.value = 0.7;
	hp.connect(highs);
	const pre = ctx.createGain();
	const shaper = ctx.createWaveShaper();
	shaper.oversample = "4x";
	shaper.curve = PREAMP_CURVES.clean;
	const lp = ctx.createBiquadFilter();
	lp.type = "lowpass";
	lp.Q.value = -3;
	const makeup = ctx.createGain();
	highs.connect(pre);
	pre.connect(shaper);
	shaper.connect(lp);
	lp.connect(makeup);
	makeup.connect(output);
	let shape: AmpPreampCurve | null = null;
	return {
		input,
		output,
		update(model, head, tau) {
			const p = model.preamp;
			if (p.curve !== shape) {
				shape = p.curve;
				shaper.curve = PREAMP_CURVES[shape];
			}
			set(ctx, hp.frequency, p.highPassHz, tau);
			set(ctx, lows.frequency, p.keepLowsHz ?? 10, tau);
			set(ctx, lowsGain.gain, p.keepLowsHz ? 1 : 0, tau);
			set(ctx, highs.frequency, p.keepLowsHz ?? 10, tau);
			const gain = 1 + head.gain * p.drive;
			set(ctx, pre.gain, gain, tau);
			set(ctx, lp.frequency, p.lowPassHz, tau);
			const f = PREAMP_SHAPES[p.curve];
			set(ctx, makeup.gain, (peak / Math.max(1e-3, f(peak * gain))) ** 0.75, tau);
		},
	};
}

/**
 * The tone stack: a low shelf, a peaking mid (its centre the model's, or
 * the bass heads' selector) and a high shelf, ±12 dB each from the knobs'
 * middle, with the passive stack's scoop taken from the mids at flat;
 * then the switches: Bright (a +6 dB shelf above 2 kHz that fades as the
 * gain rises, as a bright cap does), Ultra Lo (lows up, mids down) and
 * Ultra Hi (a shelf above 3 kHz).
 */
export function createToneStackStage(ctx: BaseAudioContext): AmpStage {
	const input = ctx.createGain();
	const output = ctx.createGain();
	const bass = ctx.createBiquadFilter();
	bass.type = "lowshelf";
	const mid = ctx.createBiquadFilter();
	mid.type = "peaking";
	mid.Q.value = 0.8;
	const treble = ctx.createBiquadFilter();
	treble.type = "highshelf";
	const bright = ctx.createBiquadFilter();
	bright.type = "highshelf";
	bright.frequency.value = 2000;
	const ultraLoShelf = ctx.createBiquadFilter();
	ultraLoShelf.type = "lowshelf";
	ultraLoShelf.frequency.value = 100;
	const ultraLoMid = ctx.createBiquadFilter();
	ultraLoMid.type = "peaking";
	ultraLoMid.frequency.value = 500;
	ultraLoMid.Q.value = 0.9;
	const ultraHi = ctx.createBiquadFilter();
	ultraHi.type = "highshelf";
	ultraHi.frequency.value = 3000;
	input.connect(bass);
	bass.connect(mid);
	mid.connect(treble);
	treble.connect(bright);
	bright.connect(ultraLoShelf);
	ultraLoShelf.connect(ultraLoMid);
	ultraLoMid.connect(ultraHi);
	ultraHi.connect(output);
	const knob = (v: number) => (v - 0.5) * 24;
	return {
		input,
		output,
		update(model, head, tau) {
			const t = model.tone;
			set(ctx, bass.frequency, t.bassHz, tau);
			set(ctx, bass.gain, knob(head.bass), tau);
			set(ctx, mid.frequency, t.midHz ?? AMP_MID_FREQUENCIES[head.midFreq] ?? 800, tau);
			set(ctx, mid.gain, knob(head.mid) - t.scoopDb, tau);
			set(ctx, treble.frequency, t.trebleHz, tau);
			set(ctx, treble.gain, knob(head.treble), tau);
			const has = (sw: (typeof model.switches)[number]) => model.switches.includes(sw);
			set(ctx, bright.gain, has("bright") && head.bright ? 6 * (1 - head.gain) : 0, tau);
			const lo = has("ultraLo") && head.ultraLo;
			set(ctx, ultraLoShelf.gain, lo ? 6 : 0, tau);
			set(ctx, ultraLoMid.gain, lo ? -4 : 0, tau);
			set(ctx, ultraHi.gain, has("ultraHi") && head.ultraHi ? 6 : 0, tau);
		},
	};
}

/**
 * The power stage: the supply sags under a loud passage (an envelope
 * follower pulls the gain down by up to the model's sag at full Power),
 * then a gain of 1 + power·drive into a soft clip, the presence shelf
 * above 4 kHz, and a make-up as the preamp's.
 */
export function createPowerStage(ctx: BaseAudioContext, peak: number): AmpStage {
	const input = ctx.createGain();
	const output = ctx.createGain();
	const sag = ctx.createGain();
	sag.gain.value = 1;
	const rectifier = ctx.createWaveShaper();
	rectifier.curve = ABS_CURVE;
	const follower = ctx.createBiquadFilter();
	follower.type = "lowpass";
	follower.frequency.value = 8;
	follower.Q.value = -3;
	const sagDepth = ctx.createGain();
	sagDepth.gain.value = 0;
	input.connect(rectifier);
	rectifier.connect(follower);
	follower.connect(sagDepth);
	sagDepth.connect(sag.gain);
	input.connect(sag);
	const pre = ctx.createGain();
	const shaper = ctx.createWaveShaper();
	shaper.curve = POWER_CURVE;
	shaper.oversample = "4x";
	const presence = ctx.createBiquadFilter();
	presence.type = "highshelf";
	presence.frequency.value = 4000;
	const makeup = ctx.createGain();
	sag.connect(pre);
	pre.connect(shaper);
	shaper.connect(presence);
	presence.connect(makeup);
	makeup.connect(output);
	return {
		input,
		output,
		update(model, head, tau) {
			const gain = 1 + head.power * model.power.drive;
			set(ctx, pre.gain, gain, tau);
			// The follower reads about 0.6 of the peak for a note: the depth is scaled so full sag at a loud note takes the gain down by `sag`.
			set(ctx, sagDepth.gain, (-model.power.sag * head.power) / (0.6 * peak), tau);
			set(ctx, presence.gain, head.presence * 6, tau);
			set(ctx, makeup.gain, (peak / Math.max(1e-3, POWER_SHAPE(peak * gain))) ** 0.75, tau);
		},
	};
}

/** The impulse for a cabinet in a context, made once per cabinet and sample rate. */
const cabinets = new WeakMap<BaseAudioContext, Map<AmpCabinetId, AudioBuffer>>();
function cabinetImpulse(ctx: BaseAudioContext, id: AmpCabinetId): AudioBuffer {
	let map = cabinets.get(ctx);
	if (!map) cabinets.set(ctx, (map = new Map()));
	let buffer = map.get(id);
	if (!buffer) {
		const samples = cabinetImpulseSamples(id, ctx.sampleRate);
		buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
		buffer.copyToChannel(samples, 0);
		map.set(id, buffer);
	}
	return buffer;
}

/** The cabinet: a ConvolverNode over the model's synthesized impulse (utils/cabinetImpulse.ts), swapped when the model changes. */
export function createCabinetStage(ctx: BaseAudioContext): AmpStage {
	const input = ctx.createGain();
	const output = ctx.createGain();
	const convolver = ctx.createConvolver();
	convolver.normalize = false;
	input.connect(convolver);
	convolver.connect(output);
	let id: AmpCabinetId | null = null;
	return {
		input,
		output,
		update(model) {
			if (model.cabinet !== id) {
				id = model.cabinet;
				convolver.buffer = cabinetImpulse(ctx, id);
			}
		},
	};
}

/** The spring reverb: the dry through, the spring's impulse (utils/springImpulse.ts) at the head's Reverb beside it; shut on a head without one. */
export function createSpringStage(ctx: BaseAudioContext): AmpStage {
	const input = ctx.createGain();
	const output = ctx.createGain();
	input.connect(output);
	const convolver = ctx.createConvolver();
	convolver.normalize = false;
	const [l, r] = springImpulseSamples(ctx.sampleRate);
	const buffer = ctx.createBuffer(2, l.length, ctx.sampleRate);
	buffer.copyToChannel(l, 0);
	buffer.copyToChannel(r, 1);
	convolver.buffer = buffer;
	const wet = ctx.createGain();
	wet.gain.value = 0;
	input.connect(convolver);
	convolver.connect(wet);
	wet.connect(output);
	return {
		input,
		output,
		update(model, head, tau) {
			set(ctx, wet.gain, model.hasReverb ? head.reverb * 0.8 : 0, tau);
		},
	};
}

export interface GateStage {
	input: AudioNode;
	output: AudioNode;
	update(on: boolean, thresholdDb: number, tau: number): void;
}

/**
 * A noise gate: the signal's envelope (rectified, smoothed over about
 * 10 ms) through a step curve that is 0 under the threshold and 1 a
 * little above it, into the gain the signal passes through. Off, the
 * signal goes round it. The threshold is in dBFS of the input; the
 * follower reads about 0.64 of a peak, which the curve allows for.
 */
export function createGateStage(ctx: BaseAudioContext): GateStage {
	const input = ctx.createGain();
	const output = ctx.createGain();
	const dry = ctx.createGain();
	input.connect(dry);
	dry.connect(output);
	const gated = ctx.createGain();
	gated.gain.value = 0;
	const gatedOut = ctx.createGain();
	gatedOut.gain.value = 0;
	input.connect(gated);
	gated.connect(gatedOut);
	gatedOut.connect(output);
	const rectifier = ctx.createWaveShaper();
	rectifier.curve = ABS_CURVE;
	const follower = ctx.createBiquadFilter();
	follower.type = "lowpass";
	follower.frequency.value = 25;
	follower.Q.value = -3;
	const step = ctx.createWaveShaper();
	input.connect(rectifier);
	rectifier.connect(follower);
	follower.connect(step);
	step.connect(gated.gain);
	let threshold = Number.NaN;
	return {
		input,
		output,
		update(on, thresholdDb, tau) {
			if (thresholdDb !== threshold) {
				threshold = thresholdDb;
				const t = 0.64 * 10 ** (thresholdDb / 20);
				step.curve = curve((x) => (x <= t ? 0 : x >= 2 * t ? 1 : (x - t) / t));
			}
			set(ctx, dry.gain, on ? 0 : 1, tau);
			set(ctx, gatedOut.gain, on ? 1 : 0, tau);
		},
	};
}
