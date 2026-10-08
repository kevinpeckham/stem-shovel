import type { StudioTrackFx } from "#lib/val/StudioSchema.js";
import { reverbImpulse } from "./drumBus";
import { createToneStage } from "./fxStages";

/**
 * A Studio track's effects (docs/multitrack-recorder.md, phase 2b), the
 * piano chain's pieces in the order a mixer has them: a compressor (a
 * crossfade round the node when off, since the browser's compressor still
 * squeezes a little at a 0 dB threshold), the tone stage (fxStages.ts:
 * tilt, air, bottom), then a reverb send beside the dry signal (the drum
 * machine's synthesized room). Plain Web Audio on a BaseAudioContext, so
 * the offline bounce builds the same chain. Levels ramp over `tau`
 * seconds: 20 ms from a slider, 0 to land at once.
 */
export interface TrackChain {
	input: AudioNode;
	output: AudioNode;
	update(fx: StudioTrackFx, tau: number): void;
}

/** Every effect off: the chain passes the signal as it is. */
export function defaultTrackFx(): StudioTrackFx {
	return {
		compressor: { amount: 0, ratio: 4, attack: 0.01, release: 0.25, makeup: 0 },
		tone: { tilt: 0, air: 0, bottom: 0 },
		reverb: { level: 0, size: 0.5 },
	};
}

/** Whether any effect is doing something, for the header's button. */
export function trackFxActive(fx: StudioTrackFx | undefined): boolean {
	if (!fx) return false;
	return (
		fx.compressor.amount > 0 ||
		fx.tone.tilt !== 0 ||
		fx.tone.air > 0 ||
		fx.tone.bottom > 0 ||
		fx.reverb.level > 0
	);
}

export function createTrackChain(ctx: BaseAudioContext, initial: StudioTrackFx): TrackChain {
	const ramp = (param: AudioParam, value: number, tau: number) =>
		tau > 0 ? param.setTargetAtTime(value, ctx.currentTime, tau) : (param.value = value);
	const input = ctx.createGain();
	const output = ctx.createGain();
	// Compressor, with a dry path round it.
	const comp = ctx.createDynamicsCompressor();
	comp.knee.value = 6;
	const makeup = ctx.createGain();
	const compDry = ctx.createGain();
	const compOut = ctx.createGain();
	input.connect(comp);
	comp.connect(makeup);
	makeup.connect(compOut);
	input.connect(compDry);
	compDry.connect(compOut);
	// Tone.
	const tone = createToneStage(ctx);
	compOut.connect(tone.input);
	// Dry plus the reverb's return.
	const dry = ctx.createGain();
	tone.output.connect(dry);
	dry.connect(output);
	const convolver = ctx.createConvolver();
	const wet = ctx.createGain();
	tone.output.connect(convolver);
	convolver.connect(wet);
	wet.connect(output);
	let size = -1;
	const update = (fx: StudioTrackFx, tau: number) => {
		const c = fx.compressor;
		const on = c.amount > 0;
		ramp(comp.threshold, -40 * c.amount, tau);
		ramp(comp.ratio, c.ratio, tau);
		comp.attack.value = c.attack;
		comp.release.value = c.release;
		ramp(makeup.gain, on ? Math.pow(10, c.makeup / 20) : 0, tau);
		ramp(compDry.gain, on ? 0 : 1, tau);
		tone.update(fx.tone, tau);
		if (fx.reverb.size !== size) {
			size = fx.reverb.size;
			convolver.buffer = reverbImpulse(ctx, size);
		}
		ramp(wet.gain, fx.reverb.level * 0.5, tau);
	};
	update(initial, 0);
	return { input, output, update };
}
