import { parseChart } from "barmark";

/** Bars a row holds at most: the lead sheet's four. */
const CHART_ROW_BARS = 4;

const DIRECTION =
	/^(?:Segno|Coda|To Coda|Fine|D\.C\.(?: al (?:Fine|Coda))?|D\.S\.(?: al (?:Fine|Coda))?)$/;
/** A cell that is not a bar: a rehearsal mark or a direction, drawn before the bar it belongs to. */
const isBar = (cell: string) => !cell.startsWith("@") && !DIRECTION.test(cell);

/** A bar line's opening (`|:`, an ending `|1 `, or `|`), its cells and its closing (`:|` or `|`). */
function cells(line: string): { open: string; cells: string[]; close: string } | null {
	const m = /^(\|:|\|\d+(?:[-,]\d+)*(?=\s)|\|)([\s\S]*?)(:\||\|)\s*$/.exec(line.trim());
	if (!m) return null;
	return { open: m[1]!, cells: m[2]!.split("|").map((c) => c.trim()), close: m[3]! };
}

/** The line's cells regrouped into rows of at most `max` bars, a mark or direction staying with the bar after it. */
function splitLine(line: string, max: number): string[] {
	const parsed = cells(line);
	// An ending is one line however long: barmark reads no continuation of it.
	if (!parsed || /^\|\d/.test(parsed.open)) return [line];
	const rows: string[][] = [[]];
	let bars = 0;
	for (const cell of parsed.cells) {
		if (bars === max) {
			rows.push([]);
			bars = 0;
		}
		rows.at(-1)!.push(cell);
		if (isBar(cell)) bars++;
	}
	if (rows.length === 1) return [line];
	return rows.map((row, i) => {
		const open = i === 0 ? parsed.open : "|";
		const close = i === rows.length - 1 ? parsed.close : "|";
		return `${open} ${row.join(" | ")} ${close}`;
	});
}

const errorsOf = (text: string) =>
	parseChart(text)
		.diagnostics.filter((d) => d.severity === "error")
		.map((d) => d.message)
		.sort()
		.join("\n");

/**
 * A chart's bar lines reflowed to at most `max` bars a row (four, the lead
 * sheet's), splitting a longer line at bar boundaries. A repeat may span
 * rows, so `|:` stays on the first row and `:|` on the last; an ending
 * stays one line, however long; a rehearsal mark or direction goes with
 * the bar after it. Headings, directives, lyrics and text lines are left alone.
 * The result is kept only when it parses to the same bars with no new
 * error; otherwise the text comes back as it was. Pure.
 */
export function reflowChartRows(text: string, max = CHART_ROW_BARS): string {
	const lines = text.split("\n");
	const out = lines.flatMap((line) => (/^\s*\|/.test(line) ? splitLine(line, max) : [line]));
	if (out.length === lines.length) return text;
	const next = out.join("\n");
	const before = parseChart(text);
	const after = parseChart(next);
	const same =
		before.bars.length === after.bars.length &&
		before.bars.every((b, i) => b.written === after.bars[i]?.written) &&
		errorsOf(next) === errorsOf(text);
	return same ? next : text;
}
