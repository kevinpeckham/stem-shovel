import type { DrumKitId, DrumVoiceId } from "$lib/constants/drumMachine";

/** A sounding hit: stop it early (a closed hat choking an open one). */
export interface DrumHit {
	stop(at: number): void;
}

/**
 * A kit plays a voice at a time on a clock into a node. Sampled kits fetch
 * their files in `warm` and decode them in `load`, which needs a context
 * and so waits for the first touch; a synthesized kit has nothing to load.
 * A `BaseAudioContext` so the WAV export can render offline.
 */
export interface DrumKit {
	readonly id: DrumKitId;
	/** Start fetching what the kit needs, ahead of the first play; safe to call again. */
	warm(): void;
	/** Fetch and decode what the kit needs; safe to call again. */
	load(ctx: BaseAudioContext): Promise<void>;
	play(
		voice: DrumVoiceId,
		ctx: BaseAudioContext,
		at: number,
		gain: number,
		out: AudioNode,
	): DrumHit | null;
}
