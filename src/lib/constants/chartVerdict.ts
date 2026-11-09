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
