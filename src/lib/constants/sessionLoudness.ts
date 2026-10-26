/**
 * How a session recording's MP3 is leveled (docs/uploads-and-blob.md,
 * "Leveling"; Kevin, 2026-10-26: a phone's mono capture folded to both
 * sides exposed clipping, and shows and practices land at every level).
 * EBU R128 through ffmpeg's two-pass `loudnorm`: an integrated loudness
 * for a live recording that streaming platforms would play as is, a true
 * peak with headroom for a phone's mono downmix (left plus right of the
 * same signal is +6 dB), and a loudness range wide enough to leave the
 * set's dynamics alone.
 */
export const SESSION_LOUDNESS = Object.freeze({
	/** Integrated loudness, LUFS. */
	integrated: -14,
	/** True-peak ceiling, dBTP. */
	truePeak: -1,
	/** Loudness range, LU. */
	range: 11,
});

/** A channel peak at or above this (dBFS) means the capture hit full scale: the declipper runs before the leveling. */
export const CLIPPED_PEAK_DB = -0.1;

/**
 * The longest recording the two-pass leveling runs on. Each pass decodes
 * the whole file (about 30× real time on one core), and the jobs function
 * has 300 s for the download, the stats pass, the measurement and the
 * encode together; a longer set gets the true-peak limiter alone, which
 * costs nothing extra (`utils/loudnorm.ts`, `peakLimiterFilter`).
 */
export const LEVEL_MAX_SECONDS = 45 * 60;
