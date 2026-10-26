/**
 * How a session recording's MP3 is leveled (docs/uploads-and-blob.md,
 * "Leveling"; Kevin, 2026-10-26: a phone's mono capture folded to both
 * sides exposed clipping, and shows and practices land at every level).
 * One `ebur128` measurement, one linear gain and a peak limiter: an
 * integrated loudness for a live recording that streaming platforms would
 * play as is, and a true peak with headroom for a phone's mono downmix
 * (left plus right of the same signal is +6 dB). The gain is the same
 * across the whole set, so its dynamics are left alone.
 */
export const SESSION_LOUDNESS = Object.freeze({
	/** Integrated loudness, LUFS. */
	integrated: -14,
	/** True-peak ceiling, dBTP. */
	truePeak: -1,
});

/** A channel peak at or above this (dBFS) means the capture hit full scale: the declipper runs before the leveling. */
export const CLIPPED_PEAK_DB = -0.1;

/** The declipper for a clipped capture: short windows cost ~4 s on a 45-minute file (the default ~110 s), with peaks rebuilt within 0.2 dB of the default's and no flat samples left (timing test, 2026-10-26). */
export const DECLIP_FILTER = "adeclip=window=30:overlap=50:arorder=4";

/**
 * At most this much (dB) of the loudest peaks goes into the limiter. A set
 * that would need more to reach the integrated target stays quieter than
 * the target instead (`utils/levelingGain.ts`).
 */
export const LEVEL_MAX_LIMIT_DB = 3;

/**
 * The longest recording that is measured and leveled. The measurement
 * costs about 0.26 s and the encode about 0.52 s per minute of audio on
 * one core, so 90 minutes fit the jobs function's 300 s twice over. A
 * longer set (or one of unknown length) gets the peak limiter alone
 * (`utils/peakLimiterFilter.ts`).
 */
export const LEVEL_MAX_SECONDS = 90 * 60;
