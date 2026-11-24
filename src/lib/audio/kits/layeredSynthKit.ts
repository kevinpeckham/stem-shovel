import type { DrumKitLayer } from "#lib/constants/drumKits.js";
import type { DrumVoiceId } from "#lib/constants/drumMachine.js";
import { velocityLayerPlan } from "#lib/utils/velocityLayerPlan.js";
import type { DrumHit, DrumKit, LayeredDrumKit } from "./types";

/**
 * A synthesized kit (the drum machine's Electronic) played by velocity
 * layer, as a multisampled kit with only V5 plays: each layer below is the
 * same sound cut by the layer plan's step (velocityLayerPlan with nothing
 * measured, DRUM_LAYER_DEFAULT_STEP_DB). The synth itself is untouched.
 */
export class LayeredSynthKit implements LayeredDrumKit {
	/** Every voice's plan alike: V5, then V5 cut a step per layer. */
	readonly #plan = velocityLayerPlan({ 5: null })!;

	constructor(
		readonly id: string,
		private readonly synth: DrumKit,
	) {}

	warm(): void {
		this.synth.warm();
	}

	load(ctx: BaseAudioContext): Promise<void> {
		return this.synth.load(ctx);
	}

	play(
		voice: DrumVoiceId,
		ctx: BaseAudioContext,
		at: number,
		gain: number,
		out: AudioNode,
		velocityLayer = 3,
	): DrumHit | null {
		const layer = Math.max(1, Math.min(5, Math.round(velocityLayer))) as DrumKitLayer;
		return this.synth.play(voice, ctx, at, gain * 10 ** (-this.#plan[layer].attenuationDb / 20), out);
	}
}
