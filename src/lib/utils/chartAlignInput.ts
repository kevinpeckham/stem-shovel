import type { ChartAlignInput } from "#lib/audio/alignChartInBrowser.js";
import { barGrid } from "#lib/audio/measures.js";
import { beatsOf, parseChart, parseMeter } from "barmark";
import { chartDefaults } from "./chartDefaults.js";
import { listenDeclared } from "./listenDeclared.js";
import type { SongChange } from "#lib/val/SongChangeSchema.js";

/**
 * What "Place from chart" hands @barmark/listen's `alignChart` besides the
 * recording's features:
 *
 * - the chart's text, read as the app reads it everywhere
 *   (`barmarkChartBars` with `chartDefaults`): a chart that sets no
 *   `time:` plays in the song's meter, not the 4/4 barmark assumes, so a
 *   copy with the song's `time:` line first is aligned (a one-bar `[n/d]`
 *   keeps its own meter either way). The map of a copy is carried back to
 *   the saved text by `timingOfText`.
 * - the song's tempo as the fallback for bars the chart gives none,
 *   converted from the song's unit (the bottom note) to barmark's beat of
 *   the aligned chart's first `time:` meter (dotted quarters in 6/8).
 * - the song's meter and tempo at its start of bar 1 as the bar the fit
 *   measures against (`listenDeclared`, none without a grid), and that
 *   start, 0:00 at the earliest (the fit measures bar 1 from it or the
 *   first sound, whichever is later).
 */
export function chartAlignInput(
	text: string,
	changes: SongChange[],
	startAt: number | null,
): ChartAlignInput {
	const defaults = chartDefaults(changes);
	const parse = parseChart(text);
	const setsTime = parse.lines.some((l) => l.kind === "directive" && l.set.time);
	const meter = defaults.meter ? parseMeter(defaults.meter) : null;
	const chart = setsTime || !meter ? text : `time: ${meter.n}/${meter.d}\n${text}`;
	const input: ChartAlignInput = { chart, startAt: Math.max(0, startAt ?? 0) };
	if (defaults.tempo !== null) {
		const first = (chart === text ? parse : parseChart(chart)).bars[0];
		const time = first?.time ?? first?.meter ?? parseMeter("4/4")!;
		input.tempo = (defaults.tempo * beatsOf(time)) / time.n;
	}
	const grid = barGrid(changes, startAt);
	if (grid) input.declared = listenDeclared(grid, changes);
	return input;
}
