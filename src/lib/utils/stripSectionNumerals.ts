/** A `## II - Verse` heading's numeral and separator: the roman numeral the band's charts once carried before the name. */
const NUMERAL_PREFIX = /^(##\s+)([IVXLC]+)\s*[-–—.:]\s*(?=\S)/gm;

/**
 * A barmark chart's section headings without the roman numerals the app's
 * earlier notation put before the name (`## II - Verse` → `## Verse`): a
 * section is identified by its name now, as barmark's replays are, and the
 * timeline abbreviates it (`sectionLabels`). Other lines are untouched.
 */
export function stripSectionNumerals(chart: string): string {
	return chart.replace(NUMERAL_PREFIX, "$1");
}
