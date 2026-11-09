import { parseChart } from "barmark";

/**
 * A barmark chart's written bar numbers by play position: `[index - 1]` is
 * the written number of the bar played `index`-th (barmark's `PlayedBar`),
 * so a repeat or a D.C. reads its bars again under their own numbers. For
 * showing a bar from a chart's timing map, whose entries count play
 * positions (GitHub issue #16). Null when the chart plays no bar.
 */
export function writtenBarsOf(markdown: string): number[] | null {
	const bars = parseChart(markdown).bars;
	if (bars.length === 0) return null;
	const written: number[] = [];
	for (const bar of bars) written[bar.index - 1] = bar.written;
	return written;
}
