/**
 * The Idea Recorder's optional silence trim (src/lib/server/transcode.ts):
 * what counts as silence for ffmpeg's silencedetect, how long a gap must be
 * before it is one, the room left before the first sound and after the
 * last, and the least worth cutting.
 */
export const TRIM_NOISE_DB = -40;
export const TRIM_MIN_SILENCE_SECONDS = 0.3;
export const TRIM_LEAD_PAD_SECONDS = 0.3;
export const TRIM_TAIL_PAD_SECONDS = 0.5;
export const TRIM_MIN_CUT_SECONDS = 0.1;
