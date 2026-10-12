import { AMP_MODELS, AMP_VOICING } from "#lib/constants/amp.js";
import type { AmpRig } from "#lib/val/AmpSchema.js";
import {
	createCabinetStage,
	createGateStage,
	createPowerStage,
	createWorkletGateStage,
	createPreampStage,
	createRoomStage,
	createSpringStage,
	createToneStackStage,
} from "./ampStages";
import {
	createChorusStage,
	createCompressorStage,
	createDelayStage,
	createFuzzStage,
	createOverdriveStage,
	createPhaserStage,
	createRotaryStage,
	createTremoloStage,
	createWahStage,
} from "./fxStages";

/**
 * The Practice Amp's chain (docs/practice-amp.md): the pedals before the
 * amp (gate, compressor, overdrive, fuzz, wah), the amp (preamp, tone
 * stack, power stage, cabinet), the pedals after it (chorus, phaser or
 * flanger, delay, rotary, a reverb pedal), the head's tremolo and spring,
 * then the master and a limiter; the pedals voiced for the instrument the
 * head is for (AMP_VOICING). Plain Web Audio on a BaseAudioContext, so the
 * same chain renders a take offline (a re-amp). `peak` is what the
 * input peaks near after the trim (a guitar or bass sits around 0.5).
 */
export interface AmpChain {
	input: AudioNode;
	output: AudioNode;
	update(rig: AmpRig, tau: number): void;
	/** A wah pedal's position (0 to 1), or null to hand the filter back to touch or sweep. */
	wahPedal(position: number | null): void;
	meters(): { reduction: number };
	/** The cabinet in the convolver now (ampStages.ts, createCabinetStage). */
	cabinetLoaded(): string;
}

const PEAK = 0.5;

export interface AmpChainOptions {
	/** The gate worklet (static/worklets/amp-gate.js) is loaded into the context: the gate with attack, hold and release. */
	gateWorklet?: boolean;
}

export function createAmpChain(
	ctx: BaseAudioContext,
	initial: AmpRig,
	options: AmpChainOptions = {},
): AmpChain {
	const input = ctx.createGain();
	const gate = options.gateWorklet ? createWorkletGateStage(ctx) : createGateStage(ctx);
	input.connect(gate.input);
	const comp = createCompressorStage(ctx);
	gate.output.connect(comp.input);
	const overdrive = createOverdriveStage(ctx, PEAK);
	comp.output.connect(overdrive.input);
	const fuzz = createFuzzStage(ctx, PEAK);
	overdrive.output.connect(fuzz.input);
	const wah = createWahStage(ctx, PEAK, 15);
	fuzz.output.connect(wah.input);
	const preamp = createPreampStage(ctx, PEAK);
	wah.output.connect(preamp.input);
	const stack = createToneStackStage(ctx);
	preamp.output.connect(stack.input);
	const power = createPowerStage(ctx, PEAK);
	stack.output.connect(power.input);
	const cabinet = createCabinetStage(ctx);
	power.output.connect(cabinet.input);
	const chorus = createChorusStage(ctx);
	cabinet.output.connect(chorus.input);
	const phaser = createPhaserStage(ctx);
	chorus.output.connect(phaser.input);
	// The delay sits beside the signal as a send; its return joins before the rotary.
	const delaySum = ctx.createGain();
	phaser.output.connect(delaySum);
	const delay = createDelayStage(ctx, 1);
	phaser.output.connect(delay.input);
	delay.output.connect(delaySum);
	const rotary = createRotaryStage(ctx);
	delaySum.connect(rotary.input);
	// The reverb pedal, after the rotary and before the head's own tremolo and spring.
	const room = createRoomStage(ctx);
	rotary.output.connect(room.input);
	const tremolo = createTremoloStage(ctx);
	room.output.connect(tremolo.input);
	const spring = createSpringStage(ctx);
	tremolo.output.connect(spring.input);
	const master = ctx.createGain();
	spring.output.connect(master);
	const limiter = ctx.createDynamicsCompressor();
	limiter.threshold.value = -3;
	limiter.knee.value = 2;
	limiter.ratio.value = 20;
	limiter.attack.value = 0.002;
	limiter.release.value = 0.1;
	master.connect(limiter);
	const output = ctx.createGain();
	limiter.connect(output);
	const update = (rig: AmpRig, tau: number) => {
		const model = AMP_MODELS[rig.model];
		const p = rig.pedals;
		// The pedals voiced for the instrument the head is for (docs/practice-amp.md, "Voiced for the instrument").
		const voice = AMP_VOICING[model.instrument];
		gate.update(p.gate, tau);
		comp.update(p.compressor, tau);
		overdrive.update(p.overdrive.drive, p.overdrive.tone, tau, {
			keepLowsHz: voice.clipKeepLowsHz,
			toneHz: voice.overdriveToneHz,
			highPassHz: voice.overdriveHighPassHz,
		});
		fuzz.update(p.fuzz.drive, p.fuzz.tone, tau, {
			keepLowsHz: voice.clipKeepLowsHz,
			toneHz: voice.fuzzToneHz,
			midsDb:
				p.fuzz.mids < 0.5
					? voice.fuzzMidsDb[0] * (1 - p.fuzz.mids * 2)
					: voice.fuzzMidsDb[1] * ((p.fuzz.mids - 0.5) * 2),
		});
		wah.update(p.wah, tau, { floorHz: voice.wahFloorHz, spanHz: voice.wahSpanHz });
		preamp.update(model, rig.head, tau);
		stack.update(model, rig.head, tau);
		power.update(model, rig.head, tau);
		cabinet.update(model, rig.head, tau);
		chorus.update(p.chorus, tau, { keepLowsHz: voice.chorusKeepLowsHz });
		phaser.update(p.phaser, tau);
		delay.update(p.delay, tau);
		rotary.update(p.rotary.speed, tau);
		room.update(p.reverb, tau, voice.reverbKeepLowsHz);
		tremolo.update(
			{
				rate: rig.head.tremolo.rate,
				depth: model.hasTremolo ? rig.head.tremolo.depth : 0,
				shape: rig.head.tremolo.shape,
			},
			tau,
		);
		spring.update(model, rig.head, tau);
		// The master's law is squared, so the knob's lower half is usable.
		const v = rig.head.master * rig.head.master;
		if (tau) master.gain.setTargetAtTime(v, ctx.currentTime, tau);
		else master.gain.value = v;
	};
	update(initial, 0);
	return {
		input,
		output,
		update,
		wahPedal: (position) => wah.pedal(position),
		meters: () => ({ reduction: comp.meters().reduction }),
		cabinetLoaded: () => cabinet.loaded(),
	};
}
