import { parseChart } from "barmark";

/**
 * Whether a text is a chart barmark can play: at least one bar. Errors may
 * remain (since barmark 0.23 an unreadable chord keeps its bar as unknown
 * harmony; a line with a structural error is left out and the rest read),
 * so a member can save a read and fix it later; a text of no bars at all
 * (the old `m<n>` measure summary, prose) is not one.
 */
export function barmarkChartPlays(text: string): boolean {
	return parseChart(text).bars.length > 0;
}
