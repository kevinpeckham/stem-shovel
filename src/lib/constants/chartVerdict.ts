/**
 * The largest share of a generated chart's bars that may have no chord the
 * model could name (unknown, "?", or "N.C.") for "Generate chart from the
 * stems" to save it unattended (utils/generatedChartVerdict.ts); above it
 * the draft is held on the draft card for review. A provisional floor, not
 * yet set by a bench study: half the bars is where a chart stops reading
 * as the song's harmony at all. stem-bench Study 34 will measure how often
 * the pipeline saves a wrong chart without warning, and this value with it.
 */
export const GENERATED_MAX_UNKNOWN_SHARE = 0.5;

/**
 * How far the placed bars' period may settle from the declared tempo's bar
 * for "Generate chart from the stems" to save unattended (a fraction; the
 * comb searches ±10 %). Above it the draft is held: stem-bench Study 34b's
 * two comb failures were unevenly cut 78s whose grids settled 7.2 % and
 * 8.9 % off the true tempo, bars short, while every grid that held settled
 * under 1 % off. Provisional, exploratory in the bench's words: a
 * registered study on fresh recordings sets it.
 */
export const GENERATED_MAX_GRID_DRIFT = 0.04;

/**
 * The fewest transcribed notes a bar, on average, for "Generate chart from
 * the stems" to save unattended; below it the draft is held. Study 34b's
 * starved recordings (acoustic-era 78s whose grids were exact to the bar)
 * gave 1.3 to 2.2 notes a bar and drafted confident wrong charts; every
 * modern recording measured gave 10 or more. Set just above the starved
 * ones so a sparse but real arrangement is not held; a study moves it.
 */
export const GENERATED_MIN_NOTES_PER_BAR = 3;

/**
 * How strong the detected beat's ×2 rung must be, as a share of the beat's
 * own autocorrelation, for the automatic grid (the stems' tempo saved on a
 * song with no settings) to take the finer bar instead
 * (utils/preferFinerBar.ts). stem-bench Study 36b: when a tracker's bar is
 * wrong it is a half bar three and a half times more often than a double,
 * and Study 37: a chart drafted at half the bar loses no chord (20/21,
 * 16/18 and 33/33 roots against 18/21, 15/18 and 28/33 at the declared
 * bar), while one at double the bar loses them. So a near tie goes to the
 * finer bar. Provisional: the bench's Study 37 app brief sweeps it.
 */
export const AUTOMATIC_FINER_BAR_SHARE = 0.9;

/**
 * The fastest tempo the finer bar may produce; above it the detected beat
 * stands. Study 36b's doubles sat on songs declared around 212 bpm and
 * its halves around 72, so the doubling that helps lands well under this;
 * the song settings take up to 400.
 */
export const AUTOMATIC_FINER_BAR_MAX_BPM = 240;
