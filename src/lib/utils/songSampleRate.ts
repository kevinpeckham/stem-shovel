import { STUDIO_SAMPLE_RATE_DEFAULT } from "#lib/constants/studio.js";

/** The rate a song renders at (docs/multitrack-recorder.md "Sample rates"): its own, or the default when it names none. */
export function songSampleRate(arrangement: { sampleRate?: number }): number {
	return arrangement.sampleRate ?? STUDIO_SAMPLE_RATE_DEFAULT;
}
