import { parseChart } from "barmark";

/** Bars a row holds at most: the lead sheet's four. */
const CHART_ROW_BARS = 4;

const DIRECTION =
	/^(?:Segno|Coda|To Coda|Fine|D\.C\.(?: al (?:Fine|Coda))?|D\.S\.(?: al (?:Fine|Coda))?)$/;
/** A cell that is not a bar: a rehearsal mark or a direction, drawn before the bar it belongs to. */
const isBar = (cell: string) => !cell.startsWith("@") && !DIRECTION.test(cell);

type BarLine = { open: string; cells: string[]; close: string };

/** A bar line's opening (`|:`, an ending `|1 `, or `|`), its cells and its closing (`:|` or `|`). */
function barLine(line: string): BarLine | null {
	const m = /^(\|:|\|\d+(?:[-,]\d+)*(?=\s)|\|)([\s\S]*?)(:\||\|)\s*$/.exec(line.trim());
	if (!m) return null;
	return { open: m[1]!, cells: m[2]!.split("|").map((c) => c.trim()), close: m[3]! };
}

/** Whether a line can join the run before it: it opens with a plain `|`, not an ending. */
const joins = (bar: BarLine) => bar.open === "|";
/** Whether the run may go on after this line: it closes with a plain `|`. */
const continues = (bar: BarLine) => bar.close === "|";

/** The run's cells regrouped into rows of at most `max` bars, a mark or direction staying with the bar after it. */
function rows(run: BarLine[], max: number): string[] {
	const groups: string[][] = [[]];
	let bars = 0;
	for (const cell of run.flatMap((b) => b.cells)) {
		if (bars === max) {
			groups.push([]);
			bars = 0;
		}
		groups.at(-1)!.push(cell);
		if (isBar(cell)) bars++;
	}
	return groups.map((row, i) => {
		const open = i === 0 ? run[0]!.open : "|";
		const close = i === groups.length - 1 ? run.at(-1)!.close : "|";
		return `${open} ${row.join(" | ")} ${close}`;
	});
}

/**
 * The text's bar lines gathered into runs a reflow may regroup: consecutive
 * bar lines where every line after the first opens with a plain `|` and
 * every line before the last closes with one. A run that opens with an
 * ending reflows only when it closes the repeat (`:|`): barmark 0.23 reads
 * an ending before the last across lines until its `:|`, while the last
 * ending ends at its line, so a plain row after it is not its continuation
 * and the run is left as written.
 */
function reflow(lines: string[], max: number): string[] {
	const out: string[] = [];
	let run: BarLine[] = [];
	const flush = () => {
		if (run.length === 0) return;
		const lastEnding = /^\|\d/.test(run[0]!.open) && run.at(-1)!.close !== ":|";
		out.push(
			...(lastEnding
				? run.map((b) => `${b.open} ${b.cells.join(" | ")} ${b.close}`)
				: rows(run, max)),
		);
		run = [];
	};
	for (const line of lines) {
		const bar = /^\s*\|/.test(line) ? barLine(line) : null;
		if (!bar) {
			flush();
			out.push(line);
			continue;
		}
		if (run.length > 0 && (!joins(bar) || !continues(run.at(-1)!))) flush();
		run.push(bar);
	}
	flush();
	return out;
}

const errorsOf = (text: string) =>
	parseChart(text)
		.diagnostics.filter((d) => d.severity === "error")
		.map((d) => d.message)
		.sort()
		.join("\n");

/**
 * A chart's bar lines reflowed to `max` bars a row (four, the lead sheet's):
 * a longer line is split at bar boundaries and consecutive short lines are
 * joined, within a run of plain bar lines. A repeat may span rows, so `|:`
 * stays on the first row and `:|` on the last, and no row is joined across
 * them; an ending before the last reflows the same way, `|1` on its first
 * row and `:|` on its last (barmark 0.23 reads it across lines), while the
 * last ending stays one line; a rehearsal mark or direction goes with the
 * bar after it. Headings, directives, lyrics and
 * text lines are left alone and end a run. The result is kept only when it
 * parses to the same bars with no new error; otherwise the text comes back
 * as it was. Pure.
 */
export function reflowChartRows(text: string, max = CHART_ROW_BARS): string {
	const lines = text.split("\n");
	const next = reflow(lines, max).join("\n");
	if (next === text) return text;
	const before = parseChart(text);
	const after = parseChart(next);
	const same =
		before.bars.length === after.bars.length &&
		before.bars.every((b, i) => b.written === after.bars[i]?.written) &&
		errorsOf(next) === errorsOf(text);
	return same ? next : text;
}
