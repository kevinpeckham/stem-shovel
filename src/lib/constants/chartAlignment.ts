/**
 * How many times the tritone control's path cost must exceed the chart's
 * for the chart to count as this recording (utils/alignedPlacements.ts).
 * Provisional: stem-bench Study 12 measured a truly wrong chart (another
 * song's) at 8.6 to 16.3 times the right one's cost, and this sits well
 * below that floor; the bench has yet to measure this transposed-control
 * form, which a chart's own tonality may sit closer to.
 */
export const ALIGNMENT_SAME_PIECE_RATIO = 3;
