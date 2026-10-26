import { EQ_BAND_SPECS, EQ_BANDS, EQ_HIGH_PASS_HZ, EQ_PEAK_Q } from "#lib/constants/playbackEq.js";
import type { PlaybackEqSettings } from "#lib/val/PlaybackEqSchema.js";

/**
 * The playback EQ as an ffmpeg `-af` filter graph, so a download can carry
 * what the player applied: the high-pass, then each band at its center
 * (`constants/playbackEq.ts`: shelves for low and high, Q 1 peaks between),
 * the same corners as the Web Audio graph. A band with no gain contributes
 * nothing; flat throughout is null (no filter at all).
 */
export function eqFilterGraph(settings: PlaybackEqSettings): string | null {
	const parts: string[] = [];
	if (settings.highPass) parts.push(`highpass=f=${EQ_HIGH_PASS_HZ}:poles=2`);
	for (const band of EQ_BANDS) {
		const { gain, freq } = settings[band];
		if (gain === 0) continue;
		const kind = EQ_BAND_SPECS[band].kind;
		if (kind === "peaking") parts.push(`equalizer=f=${freq}:width_type=q:w=${EQ_PEAK_Q}:g=${gain}`);
		else parts.push(`${kind}=f=${freq}:g=${gain}`);
	}
	return parts.length ? parts.join(",") : null;
}
