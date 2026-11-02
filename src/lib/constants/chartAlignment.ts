/**
 * How many times the tritone control's path cost must exceed the chart's
 * for the chart to count as this recording (utils/alignedPlacements.ts).
 * stem-bench Study 14 measured it on real recordings: the band's own,
 * correct charts scored 2.04 and 2.53, another song's chart 1.17 and 1.24,
 * and 1.6 sits at the midpoint of that gap. The first value, 3, came from
 * synthetic renders (ratios of 24 to 49), where the chart and the audio
 * are the same pads; real playing is never that close, and at 3 every
 * correct chart read as "not this recording". The caveat: two songs of
 * one band, two charts a class. The ratio alone is not enough: see
 * `ALIGNMENT_SAME_PIECE_LOCAL_COST`.
 */
export const ALIGNMENT_SAME_PIECE_RATIO = 1.6;

/**
 * The most the median of the path's per-bar local cost may be for the
 * chart to count as this recording; both this and the ratio must hold
 * (utils/alignedPlacements.ts). stem-bench Study 15 proposed it and
 * Study 16 (2026-11-01) made it necessary: one real wrong pairing, the
 * Eat All the Clocks recording against the Mop Heart chart, scores a
 * ratio of 1.74, over the 1.6 gate, and only its median local cost of
 * 0.323 tells it apart; the band's correct charts sit well under 0.30.
 */
export const ALIGNMENT_SAME_PIECE_LOCAL_COST = 0.3;

/**
 * The share of the recording's loudest window's RMS that counts as
 * audible (audio/chartAlignment.ts `audibleSpan`): 0.02 is 34 dB under
 * the peak, above a quiet room's noise and a lossy encoder's hiss, below
 * a soft pick-up note. The first and last audible windows anchor the
 * first and last sections (stem-bench Study 14's FIRST-ONSET and
 * LAST-SOUND rules).
 */
export const ALIGNMENT_SOUND_FLOOR = 0.02;

/** The RMS window for `ALIGNMENT_SOUND_FLOOR`, in seconds: short enough to place an onset within it. */
export const ALIGNMENT_SOUND_WINDOW_SEC = 0.05;
