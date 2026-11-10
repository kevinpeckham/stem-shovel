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
