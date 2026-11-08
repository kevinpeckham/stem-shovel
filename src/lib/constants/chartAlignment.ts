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

/**
 * How far from the middle's lattice a bar start may sit and still be
 * trusted, as a share of the bar (audio/alignmentRepair.ts
 * `trustedSpan`; stem-bench Study 26c): a quarter bar, the tolerance the
 * bench scored the ends at, wide enough for a played bar's wobble and
 * narrow enough that the warping's compressed intro bars (half-length on
 * Letter Lands) fall outside it.
 */
export const REPAIR_TRUST_FRACTION = 0.25;

/**
 * How far an extrapolated end may slide onto the recording's onsets, as a
 * share of the bar (stem-bench Study 26c, the v3 fence): ±0.25 bar. Study
 * 26b's ±0.5 reaches the half-bar backbeat, which can outscore the
 * downbeat, and moved Peaceful Dreams' intro 0.60 s off; the quarter-bar
 * fence fixed it and kept Letter Lands at 0.05/0.02 s.
 */
export const REPAIR_SLIDE_FRACTION = 0.25;

/**
 * How far the whole grid may slide onto the recording's onsets, in beats
 * (audio/alignmentRepair.ts `rephaseGrid`; stem-bench Study 27, recipe
 * v5): ±0.5 beat, the bar divided by the meter's beats. At fast tempos the
 * warping's middle sits a coherent sub-beat off the notes (Mop Heart, 224
 * bpm in 3/4: 0.42 s); half a beat reaches that and never the neighboring
 * beat, which could outscore the downbeat. Gates passed on all four bench
 * songs; the refusal is unchanged.
 */
export const REPHASE_FENCE_BEATS = 0.5;

/**
 * How early the onset envelope (audio/analysis.ts `onsetEnvelope`) reads an
 * onset, in seconds: each frame is stamped at its window's start, and the
 * spectral flux peaks as the onset enters the 2048-sample window (93 ms at
 * 22 050 Hz), so a hard onset peaks about 70 ms before it sounds and an
 * 80 ms attack about 50 ms before (measured 2026-11-08 on synthetic hits
 * with 0, 10, 30 and 80 ms attacks: 75, 68, 60 and 54 ms early). The
 * drums carry the lattice the grid re-phase slides onto, so the lead is the
 * hard-onset figure; `repairAlignment` adds it to the re-phased starts.
 * Recipe v3 kept the warping's own starts through the middle and did not
 * show it; v5 puts every bar on the envelope's lattice and would inherit
 * it. The bench measured Study 27 through the same envelope: its 50–70 ms
 * residuals on the real songs are this lead.
 */
export const ONSET_ENVELOPE_LEAD_SEC = 0.07;

/** The end slide's step in seconds (Study 26c): 10 ms, finer than the onset envelope's frames matter for. */
export const REPAIR_SLIDE_STEP_SEC = 0.01;

/**
 * The least share of the bar starts the trusted span must cover, or the
 * repair refuses (Study 26c): under half means the chart does not line up
 * with the recording's middle, which on the bench marked the one wrong
 * pairing (Eat All the Clocks against its fixture chart) and no right one.
 */
export const REPAIR_MIN_TRUSTED_SHARE = 0.5;

/**
 * The onset comb's search around the declared bar (stem-bench Study 24,
 * as Study 26c uses it): ±10 %, which keeps out the half- and
 * double-bar lattices the objective would prefer by degeneracy; a 0.2 %
 * coarse step, then 0.02 % around the coarse best; the phase in 10 ms
 * steps.
 */
export const COMB_RANGE_FRACTION = 0.1;
export const COMB_COARSE_STEP_FRACTION = 0.002;
export const COMB_FINE_STEP_FRACTION = 0.0002;
export const COMB_PHASE_STEP_SEC = 0.01;
