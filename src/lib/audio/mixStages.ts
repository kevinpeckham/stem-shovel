import { reverbImpulse } from "./drumBus";
import { createCompressorStage, createToneStage } from "./fxStages";
import type { InsertKind } from "#lib/constants/studioInserts.js";

/**
 * The stages Dawn's inserts are built from (docs/dawn-daw-plan.md, D2):
 * plain Web Audio on a BaseAudioContext so the offline bounce builds the
 * same chain. Each takes its settings whole (`update`, ramping over `tau`
 * seconds, 0 to land at once) and names the AudioParams a lane can drive
 * (`params`), which the panel marks automatable
 * (constants/studioInserts.ts). The compressor and the tone stage are the
 * instruments' own (fxStages.ts); the EQ, the delay, the reverb and the
 * limiter are here.
 */
export interface MixStage {
	input: AudioNode;
	output: AudioNode;
	update(settings: Record<string, number | boolean>, tau: number): void;
	params: Record<string, AudioParam>;
}

const num = (s: Record<string, number | boolean>, key: string, fallback: number) => {
	const v = s[key];
	return typeof v === "number" && Number.isFinite(v) ? v : fallback;
};
const ramp = (ctx: BaseAudioContext, p: AudioParam, value: number, tau: number) => {
	if (tau > 0) p.setTargetAtTime(value, ctx.currentTime, tau);
	else p.value = value;
};

/** Three bands: a low shelf, a peak, a high shelf, gains in dB. */
function createEqStage(ctx: BaseAudioContext): MixStage {
	const input = ctx.createGain();
	const output = ctx.createGain();
	const low = ctx.createBiquadFilter();
	low.type = "lowshelf";
	const mid = ctx.createBiquadFilter();
	mid.type = "peaking";
	const high = ctx.createBiquadFilter();
	high.type = "highshelf";
	input.connect(low);
	low.connect(mid);
	mid.connect(high);
	high.connect(output);
	return {
		input,
		output,
		params: {
			lowGain: low.gain,
			lowFreq: low.frequency,
			midGain: mid.gain,
			midFreq: mid.frequency,
			midQ: mid.Q,
			highGain: high.gain,
			highFreq: high.frequency,
		},
		update(s, tau) {
			ramp(ctx, low.gain, num(s, "lowGain", 0), tau);
			ramp(ctx, low.frequency, num(s, "lowFreq", 120), tau);
			ramp(ctx, mid.gain, num(s, "midGain", 0), tau);
			ramp(ctx, mid.frequency, num(s, "midFreq", 1000), tau);
			ramp(ctx, mid.Q, num(s, "midQ", 1), tau);
			ramp(ctx, high.gain, num(s, "highGain", 0), tau);
			ramp(ctx, high.frequency, num(s, "highFreq", 6000), tau);
		},
	};
}

/** The instruments' compressor (a true bypass at amount 0) as an insert; nothing of it is an AudioParam a lane can hold. */
function createCompressorInsert(ctx: BaseAudioContext): MixStage {
	const stage = createCompressorStage(ctx);
	return {
		input: stage.input,
		output: stage.output,
		params: {},
		update(s, tau) {
			stage.update(
				{
					amount: num(s, "amount", 0),
					ratio: num(s, "ratio", 4),
					attack: num(s, "attack", 0.01),
					release: num(s, "release", 0.25),
					makeup: num(s, "makeup", 0),
				},
				tau,
			);
		},
	};
}

/** The instruments' tone stage (tilt, air, bottom) as an insert. */
function createToneInsert(ctx: BaseAudioContext): MixStage {
	const stage = createToneStage(ctx);
	return {
		input: stage.input,
		output: stage.output,
		params: {},
		update(s, tau) {
			stage.update(
				{ tilt: num(s, "tilt", 0), air: num(s, "air", 0), bottom: num(s, "bottom", 0) },
				tau,
			);
		},
	};
}

/** A delay beside the dry signal: the time, a feedback loop with a darkening low-pass (and a soft clip when `analog`), the return level. */
function createDelayInsert(ctx: BaseAudioContext): MixStage {
	const input = ctx.createGain();
	const output = ctx.createGain();
	const delay = ctx.createDelay(2.1);
	const feedback = ctx.createGain();
	const damping = ctx.createBiquadFilter();
	damping.type = "lowpass";
	damping.frequency.value = 3200;
	const shaper = ctx.createWaveShaper();
	const wet = ctx.createGain();
	input.connect(output);
	input.connect(delay);
	delay.connect(damping);
	damping.connect(shaper);
	shaper.connect(wet);
	shaper.connect(feedback);
	feedback.connect(delay);
	wet.connect(output);
	let analog: boolean | null = null;
	return {
		input,
		output,
		// `time` is here for the engine's tempo sync (scheduled as the tempo steps), not for a lane: the panel marks it not automatable.
		params: { time: delay.delayTime, feedback: feedback.gain, level: wet.gain },
		update(s, tau) {
			ramp(ctx, delay.delayTime, num(s, "time", 0.375), tau);
			ramp(ctx, feedback.gain, num(s, "feedback", 0.35), tau);
			ramp(ctx, wet.gain, num(s, "level", 0.3), tau);
			const wantAnalog = s.analog === true;
			if (wantAnalog !== analog) {
				analog = wantAnalog;
				const n = 2048;
				const curve = new Float32Array(n);
				for (let i = 0; i < n; i++) {
					const x = (i / (n - 1)) * 2 - 1;
					curve[i] = analog ? Math.tanh(x * 1.6) / 1.6 : x;
				}
				shaper.curve = curve;
				damping.frequency.value = analog ? 2000 : 3200;
			}
		},
	};
}

/** The synthesized room beside the dry signal, as the drum machine's and the old track chain's. */
function createReverbInsert(ctx: BaseAudioContext): MixStage {
	const input = ctx.createGain();
	const output = ctx.createGain();
	const convolver = ctx.createConvolver();
	const wet = ctx.createGain();
	// The return at half the level, as the old chain had it: `wet` carries the level in the lane's 0..1, `half` the scale.
	const half = ctx.createGain();
	half.gain.value = 0.5;
	input.connect(output);
	input.connect(convolver);
	convolver.connect(wet);
	wet.connect(half);
	half.connect(output);
	let size = -1;
	return {
		input,
		output,
		params: { level: wet.gain },
		update(s, tau) {
			const next = num(s, "size", 0.5);
			if (next !== size) {
				size = next;
				convolver.buffer = reverbImpulse(ctx, size);
			}
			ramp(ctx, wet.gain, num(s, "level", 0.3), tau);
		},
	};
}

/** A fast compressor with its knee shut, 20:1 above the ceiling, the make-up holding the ceiling at full scale. */
function createLimiterInsert(ctx: BaseAudioContext): MixStage {
	const input = ctx.createGain();
	const output = ctx.createGain();
	const comp = ctx.createDynamicsCompressor();
	comp.knee.value = 0;
	comp.ratio.value = 20;
	comp.attack.value = 0.001;
	input.connect(comp);
	comp.connect(output);
	return {
		input,
		output,
		params: {},
		update(s, tau) {
			const ceiling = num(s, "ceiling", -1);
			ramp(ctx, comp.threshold, ceiling, tau);
			ramp(ctx, comp.release, num(s, "release", 0.1), tau);
			ramp(ctx, output.gain, 10 ** (-ceiling / 20), tau);
		},
	};
}

export const MIX_STAGES: Record<InsertKind, (ctx: BaseAudioContext) => MixStage> = {
	eq: createEqStage,
	compressor: createCompressorInsert,
	tone: createToneInsert,
	delay: createDelayInsert,
	reverb: createReverbInsert,
	limiter: createLimiterInsert,
};
