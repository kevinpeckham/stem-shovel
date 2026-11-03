import { parseChart, parseChord } from "barmark";
import { type ChartBar, barmarkChartBars } from "./barmarkChartBars.js";
import { type ChartReadMeasure, chartBars, chartReadMeasures } from "./chartBars.js";
import { chartDiagnosticText } from "./chartDiagnosticText.js";

/**
 * A score's chart read stored in the old `m<n>` measure summary, written as
 * the barmark chart `readChartWithAi` writes now (scripts/convert-chart-reads.ts).
 * Mechanical: a directive line from the first key (at measure 1), meter and
 * tempo, and one before a measure where one changes; every measure from 1
 * to the last once, as a cell (a measure the summary left out, or one with
 * no chords, as `/`), so the bars' written numbers are the old measure
 * numbers; `|:` and `:|` (a `:|` with no `|:` opens where the old reader
 * went back to: the bar after the previous `:|`, or the start); `ending n`
 * as an ending bar line; a `[A]` mark as `@A` when the label is letters and
 * digits, else quoted words; quoted words as quoted words; a word that is
 * exactly a direction (Segno, D.S. al Coda, Fine…) as a direction cell;
 * `Title:`, `Part:`, `Note:` and other lines kept as prose.
 *
 * Refuses rather than guesses: the text is accepted only when barmark reads
 * it with no errors and `barmarkChartBars` plays the same bars from it as
 * `chartBars` from the old text (count, and each bar's measure number,
 * chords, bpm, meter and key). The old reader never followed a direction,
 * and barmark does, so directions as cells pass only where they change no
 * bar; otherwise they stay quoted words, as the old reader took them.
 */
export type ChartReadConversion =
	| { ok: true; text: string; directionsAsWords: boolean }
	| { ok: false; reason: string };

/** barmark's directions in its own spelling, by their spelling collapsed to lowercase. */
const DIRECTIONS = new Map(
	[
		"Segno",
		"Coda",
		"To Coda",
		"Fine",
		"D.C.",
		"D.C. al Fine",
		"D.C. al Coda",
		"D.S.",
		"D.S. al Fine",
		"D.S. al Coda",
	].map((d) => [d.toLowerCase(), d]),
);
/** Directions that mark the place a bar begins; the rest come after their bar. */
const BEFORE_BAR = new Set(["Segno", "Coda"]);
const LABEL = /^[A-Za-z0-9]+$/;
const BARS_PER_LINE = 4;
const MEASURE_LINE = /^m\d+\b/;
/** The tempo both readers take when the old text states none, so their bars can be compared. */
const COMPARE_TEMPO = 120;

const directionOf = (word: string) =>
	DIRECTIONS.get(word.trim().replace(/\s+/g, " ").toLowerCase());

/** "A♭ major" as barmark spells a key ("Ab"; "F♯ minor" is "F#m"). */
function keyDirective(key: string): string {
	const [tonic = "", mode = ""] = key.split(/\s+/);
	const ascii = tonic.replace("♭", "b").replace("♯", "#");
	return mode.toLowerCase() === "minor" ? `${ascii}m` : ascii;
}

interface Settings {
	key: string | null;
	meter: string | null;
	tempo: number | null;
}

/** The directive line that sets what changes from `now` to `next`; null when nothing does. */
function directiveLine(now: Settings, next: Settings): string | null {
	const parts: string[] = [];
	if (next.key !== null && next.key !== now.key) parts.push(`key: ${keyDirective(next.key)}`);
	if (next.meter !== null && next.meter !== now.meter) parts.push(`time: ${next.meter}`);
	if (next.tempo !== null && next.tempo !== now.tempo) parts.push(`tempo: ${next.tempo}`);
	return parts.length ? parts.join(", ") : null;
}

const EMPTY: ChartReadMeasure = {
	chords: [],
	key: null,
	meter: null,
	tempo: null,
	mark: null,
	words: [],
	extra: "",
	section: null,
	open: false,
	close: false,
	ending: null,
};

/** The measures that open a repeat: each `|:`, and for a `:|` with none, where the old reader went back to. */
function repeatOpens(at: (n: number) => ChartReadMeasure, last: number): Set<number> {
	const opens = new Set<number>();
	let start = 1;
	let opened = false;
	for (let n = 1; n <= last; n++) {
		const m = at(n);
		if (m.open) [opened, start] = [true, n];
		if (m.open) opens.add(n);
		if (!m.close) continue;
		if (!opened) opens.add(start);
		[opened, start] = [false, n + 1];
	}
	return opens;
}

/** Whether the ending that begins at `from` closes its repeat (`:|`) before another ending or repeat begins. */
function endingCloses({ at, opens, last }: Measures, from: number): boolean {
	for (let n = from; n <= last; n++) {
		if (n > from && (at(n).ending !== null || opens.has(n))) return false;
		if (at(n).close) return true;
	}
	return false;
}

/** A measure's text beyond its chords: a mark that is no label, its quoted words, its header's other words. */
const textsOf = (m: ChartReadMeasure) => [
	...(m.mark && !LABEL.test(m.mark) ? [m.mark] : []),
	...m.words,
	...(m.extra ? [m.extra] : []),
];

/** A measure's cells: a rehearsal mark and a Segno or Coda before it, the bar, the directions after it. */
function measureCells(m: ChartReadMeasure, directionsAsCells: boolean): string[] {
	const texts = textsOf(m);
	const directions = texts.map((t) => (directionsAsCells ? directionOf(t) : undefined));
	const words = texts.filter((_, i) => !directions[i]).map((w) => `"${w}"`);
	const cells = directions.filter((d) => d !== undefined);
	const bar = [...words, ...(m.chords.length ? m.chords : ["/"])].join(" ");
	return [
		...(m.mark && LABEL.test(m.mark) ? [`@${m.mark}`] : []),
		...cells.filter((d) => BEFORE_BAR.has(d)),
		bar,
		...cells.filter((d) => !BEFORE_BAR.has(d)),
	];
}

/** A bar line being written. */
interface Line {
	head: string;
	cells: string[];
	bars: number;
	/** An ending that closes its repeat: one bar line to its `:|`, never wrapped. */
	whole: boolean;
}

/** The measures as the writer reads them: by number, the last, and where repeats open. */
interface Measures {
	at: (n: number) => ChartReadMeasure;
	last: number;
	opens: Set<number>;
}

const lineText = (line: Line, tail: string) => `${line.head}${line.cells.join(" | ")}${tail}`;

/** The bar line measure `n` begins: an ending, an opening repeat or a plain one. */
function lineAt(ms: Measures, n: number): Line {
	const { ending } = ms.at(n);
	const head = ending !== null ? `|${ending} ` : ms.opens.has(n) ? "|: " : "| ";
	return { head, cells: [], bars: 0, whole: ending !== null && endingCloses(ms, n) };
}

/** Whether measure `n` begins a new bar line: a repeat, an ending, a directive before it, or a full line. */
function breaksAt(ms: Measures, n: number, line: Line, directive: string | null): boolean {
	const full = !line.whole && line.bars >= BARS_PER_LINE;
	return ms.opens.has(n) || ms.at(n).ending !== null || directive !== null || full;
}

const settingsAt = (now: Settings, m: ChartReadMeasure): Settings => ({
	key: m.key ?? now.key,
	meter: m.meter ?? now.meter,
	tempo: m.tempo ?? now.tempo,
});

/** The bar lines and directive lines of the measures, a new line where a repeat, an ending or a directive begins. */
function barLines(
	measures: Map<number, ChartReadMeasure>,
	start: Settings,
	directionsAsCells: boolean,
): string[] {
	const at = (n: number) => measures.get(n) ?? EMPTY;
	const last = Math.max(...measures.keys());
	const ms: Measures = { at, last, opens: repeatOpens(at, last) };
	const out: string[] = [];
	let line: Line | null = null;
	const end = (tail: string) => {
		if (line) out.push(lineText(line, tail));
		line = null;
	};
	let now = start;
	for (let n = 1; n <= last; n++) {
		const next = settingsAt(now, at(n));
		const directive = directiveLine(now, next);
		now = next;
		if (line && breaksAt(ms, n, line, directive)) end(" |");
		if (directive) out.push(directive);
		line ??= lineAt(ms, n);
		line.cells.push(...measureCells(at(n), directionsAsCells));
		line.bars++;
		if (at(n).close) end(" :|");
	}
	end(" |");
	return out;
}

const firstOf = <T>(
	measures: Map<number, ChartReadMeasure>,
	pick: (m: ChartReadMeasure) => T | null,
) =>
	[...measures.keys()]
		.sort((a, b) => a - b)
		.map((n) => pick(measures.get(n)!))
		.find((v) => v !== null) ?? null;

/** The chart in barmark: prose before the bars, the starting directives, the bars, prose after them. */
function writeChart(summary: string, directionsAsCells: boolean): string {
	const measures = chartReadMeasures(summary);
	const lines = summary.split(/\r?\n/).map((l) => l.trim());
	const firstMeasure = lines.findIndex((l) => MEASURE_LINE.test(l));
	const prose = (from: number, to: number) =>
		lines.slice(from, to).filter((l) => l && !MEASURE_LINE.test(l));
	const settings: Settings = {
		key: measures.get(1)?.key ?? null,
		meter: firstOf(measures, (m) => m.meter),
		tempo: firstOf(measures, (m) => m.tempo),
	};
	const start = directiveLine({ key: null, meter: null, tempo: null }, settings);
	return [
		...prose(0, firstMeasure),
		...(start ? [start] : []),
		...barLines(measures, settings, directionsAsCells),
		...prose(firstMeasure, lines.length),
	].join("\n");
}

/** A chord as both readers would name it: barmark's canonical spelling when it reads one. */
function chordName(chord: string): string {
	const read = parseChord(chord);
	return read.ok ? read.value.canonical : chord;
}

const keyName = (key: string | null) => key?.replace("♭", "b").replace("♯", "#") ?? null;

function barText(b: ChartBar): string {
	return `measure ${b.measure}: ${b.chords.join(" ") || "/"} at ${b.bpm} in ${b.meter}, ${b.key ?? "no key"}`;
}

/** Why barmark's bars of the new text differ from the old reader's bars of the old; null when they agree. */
function barsDiffer(summary: string, text: string): string | null {
	const stated = chartBars(summary, { tempo: null, meter: null });
	const defaults = { tempo: stated ? null : COMPARE_TEMPO, meter: null };
	const old = stated ?? chartBars(summary, defaults);
	const read = barmarkChartBars(text, defaults);
	if (!old || !read) return "no bars to compare";
	if (old.bars.length !== read.bars.length)
		return `${read.bars.length} bars played where the old read plays ${old.bars.length}`;
	for (const [i, before] of old.bars.entries()) {
		const was = barText({
			...before,
			chords: before.chords.map(chordName),
			key: keyName(before.key),
		});
		const now = barText({ ...read.bars[i]!, key: keyName(read.bars[i]!.key) });
		if (was !== now) return `bar ${i + 1} plays ${now} where the old read plays ${was}`;
	}
	return null;
}

/** The text when barmark reads it with no error and plays the old bars; else why not. */
function checked(summary: string, text: string): ChartReadConversion {
	const error = parseChart(text).diagnostics.find((d) => d.severity === "error");
	if (error)
		return { ok: false, reason: `the barmark text has an error: ${chartDiagnosticText(error)}` };
	const differs = barsDiffer(summary, text);
	return differs ? { ok: false, reason: differs } : { ok: true, text, directionsAsWords: false };
}

export function chartReadToBarmark(summary: string): ChartReadConversion {
	if (chartReadMeasures(summary).size === 0) return { ok: false, reason: "no measure lines" };
	const withCells = writeChart(summary, true);
	const asCells = checked(summary, withCells);
	if (asCells.ok) return asCells;
	const withWords = writeChart(summary, false);
	if (withWords === withCells) return asCells;
	const asWords = checked(summary, withWords);
	return asWords.ok ? { ...asWords, directionsAsWords: true } : asWords;
}
