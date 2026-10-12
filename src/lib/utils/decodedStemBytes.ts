import { STEM_CONTEXT_RATE } from "#lib/constants/stemFormats.js";

/**
 * The PCM a set of stems takes once decoded into the player's context:
 * seconds × channels × rate × 4 bytes a sample (Float32), the figure the
 * memory warnings reckon with (docs/audio-engine.md, "Memory is the binding
 * limit"). A stem whose duration or channels are unknown counts as nothing.
 */
export function decodedStemBytes(
	stems: { durationSeconds?: number | null; channels?: number | null }[],
	sampleRate = STEM_CONTEXT_RATE,
): number {
	let bytes = 0;
	for (const s of stems) bytes += (s.durationSeconds ?? 0) * (s.channels ?? 0) * sampleRate * 4;
	return Math.round(bytes);
}
