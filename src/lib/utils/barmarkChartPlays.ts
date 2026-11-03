import { parseChart } from "barmark";

/**
 * Whether a text is a chart barmark can play: at least one bar. Errors on
 * other lines may remain (`parseChart` leaves an erroneous line out and
 * reads the rest), so a member can save a read and fix it later; a text
 * of no bars at all (the old `m<n>` measure summary, prose) is not one.
 */
export function barmarkChartPlays(text: string): boolean {
	return parseChart(text).bars.length > 0;
}
