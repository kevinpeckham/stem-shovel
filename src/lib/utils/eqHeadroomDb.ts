import { EQ_BANDS } from "#lib/constants/playbackEq.js";
import type { PlaybackEqSettings } from "#lib/val/PlaybackEqSchema.js";

/**
 * The trim the playback EQ takes after its bands, in dB: the largest boost
 * among them, so a boosted band ends up where it was and the rest comes
 * down by as much. A leveled recording sits near full scale (SESSION_LOUDNESS
 * leaves 1 dB), and a boost on top of that clips at the output otherwise
 * (Kevin, 2026-10-26). Cuts alone need no trim: 0.
 */
export function eqHeadroomDb(settings: PlaybackEqSettings): number {
	return Math.max(0, ...EQ_BANDS.map((b) => settings[b].gain));
}
