import type { DrumKitId, DrumVoiceId } from "$lib/constants/drumMachine";

/** A sounding hit: stop it early (a closed hat choking an open one). */
export interface DrumHit {
	stop(at: number): void;
}

/**
 * A kit plays a voice at a time on the audio clock into a node. Sampled
 * kits decode their files in `load`, which needs a context and so waits
 * for the first touch; a synthesized kit has nothing to load.
 */
export interface DrumKit {
	readonly id: DrumKitId;
	/** Fetch and decode what the kit needs; safe to call again. */
	load(ctx: AudioContext): Promise<void>;
	play(
		voice: DrumVoiceId,
		ctx: AudioContext,
		at: number,
		gain: number,
		out: AudioNode,
	): DrumHit | null;
}
