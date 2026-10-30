import { chartSectionName } from "./chartSectionName.js";

/**
 * A chart as the bars it plays, in play order (stem-bench Study 12: the
 * chart rendered as chord pads at its declared tempo and aligned to the
 * recording places every bar in seconds). This file reads the measure
 * summary a notation file's chart read stores (`readChartWithAi`,
 * `m<n> key <key> <d>/<d> tempo <bpm> [<mark>] "<words>" |: :| ending <n>:
 * <chords>`); `chordChartBars` reads a band's markdown chart into the
 * same shape.
 *
 * Repeats and endings are expanded: a `:|` sends play back to the last
 * `|:` (or, without one, the bar after the previous `:|`, or the start)
 * once; on the second pass a first ending is jumped to the bar after its
 * `:|`, where the second ending plays. D.S., D.C., coda and fine are not
 * followed (a warning says so): the bars play straight through. A measure
 * the summary leaves out holds the harmony before it. Tempo, meter and
 * key marks apply from their measure on; before the first mark the
 * defaults (the song's own settings) apply, else the first mark itself.
 * Never throws: what it cannot read is a warning.
 */
export interface ChartBar {
	/** The chart's own measure number this bar plays (a repeat plays a measure again); 1-based. For a chord chart, the running bar count. */
	measure: number;
	/** Chord symbols in order; [] means the previous bar's harmony holds; ["N.C."] is silence. */
	chords: string[];
	/** The tempo in force, bpm of the meter's beat. */
	bpm: number;
	/** The time signature in force, e.g. "4/4". */
	meter: string;
	/** The key in force, e.g. "D major"; null when the chart marks none. */
	key: string | null;
	/** A section that begins at this bar: a rehearsal mark's text or a heading; null otherwise. */
	section: string | null;
}
export interface ChartBars {
	bars: ChartBar[];
	warnings: string[];
}

interface Marks {
	chords: string[];
	key: string | null;
	meter: string | null;
	tempo: number | null;
	section: string | null;
	open: boolean;
	close: boolean;
	ending: number | null;
}

/** A runaway expansion (a malformed repeat) stops here; no song is this long. */
const MAX_BARS = 2000;
const MEASURE = /^m(\d+)\b(.*)$/;
const KEY = /\bkey ([A-G][♭♯#b]?\s+(?:major|minor))\b/i;
const METER = /(?:^|\s)(\d{1,2}\/\d{1,2})(?=\s|$)/;
const TEMPO = /\btempo (\d+(?:\.\d+)?)\b/;
const ENDING = /\bending (\d+)/i;
const DIRECTION = /\bD\.\s?[SC]\.|\bcoda\b|\bfine\b|\bsegno\b/i;

const EMPTY: Marks = {
	chords: [],
	key: null,
	meter: null,
	tempo: null,
	section: null,
	open: false,
	close: false,
	ending: null,
};

function plausibleTempo(text: string | undefined): number | null {
	const bpm = Number(text);
	return text && bpm >= 20 && bpm <= 400 ? bpm : null;
}

function sectionOf(header: string, words: string[]): string | null {
	const mark = /\[([^\]]+)\]/.exec(header)?.[1]?.trim();
	if (mark) return mark;
	return words.map(chartSectionName).find(Boolean) ?? null;
}

function marksOf(rest: string, measure: number, warnings: string[]): Marks {
	const words = [...rest.matchAll(/"([^"]*)"/g)].map((m) => m[1]!);
	const line = rest.replace(/"[^"]*"/g, " ");
	// With the repeat signs out of the way the colon left is the chords' (":|:" closes, then lists).
	const bare = line.replace(/:\|/g, " ").replace(/\|:/g, " ");
	const sep = bare.indexOf(":");
	const header = sep < 0 ? bare : bare.slice(0, sep);
	const chords =
		sep < 0
			? []
			: bare
					.slice(sep + 1)
					.split(/\s+/)
					.filter((t) => t && t !== "|");
	const direction = [header, ...words].map((w) => DIRECTION.exec(w)?.[0]).find(Boolean);
	if (direction)
		warnings.push(`m${measure}: "${direction}" is not followed; the bars play straight through`);
	return {
		chords,
		key:
			KEY.exec(header)?.[1]
				?.replace(/#/g, "♯")
				.replace(/(?<=[A-G])b/g, "♭") ?? null,
		meter: METER.exec(header)?.[1] ?? null,
		tempo: plausibleTempo(TEMPO.exec(header)?.[1]),
		section: sectionOf(header, words),
		// ":|:" closes and then lists; it opens nothing.
		open: line.replace(/:\|/g, " ").includes("|:"),
		close: line.includes(":|"),
		ending: ENDING.test(header) ? Number(ENDING.exec(header)![1]) : null,
	};
}

/** The first measure from `from` on that closes a repeat; the last measure when none does. */
function closeFrom(at: (n: number) => Marks, from: number, last: number): number {
	for (let n = from; n <= last; n++) if (at(n).close) return n;
	return last;
}

/** Where play is: the measure, where a repeat goes back to, which pass of it, and the ending in force. */
interface Cursor {
	i: number;
	repeatStart: number;
	pass: number;
	ending: number | null;
}

/** A fresh first pass from measure `i`, which a repeat would go back to. */
function restart(c: Cursor, i: number): void {
	Object.assign(c, { i, repeatStart: i, pass: 1, ending: null });
}

/** Plays the measure at the cursor (or jumps an earlier pass's ending) and moves on. */
function step(c: Cursor, at: (n: number) => Marks, last: number, order: number[]): void {
	const m = at(c.i);
	if (m.open && c.repeatStart !== c.i) restart(c, c.i);
	if (m.ending !== null) c.ending = m.ending;
	// An earlier pass's ending: on to the bar after its repeat sign, where the next ending is.
	if (c.ending !== null && c.ending < c.pass) return restart(c, closeFrom(at, c.i, last) + 1);
	order.push(c.i);
	if (m.close && c.pass === 1) Object.assign(c, { i: c.repeatStart, pass: 2, ending: null });
	else if (m.close) restart(c, c.i + 1);
	else c.i++;
}

/** The measure numbers in the order they play, repeats and endings expanded. */
function playOrder(at: (n: number) => Marks, last: number): number[] {
	const order: number[] = [];
	const cursor: Cursor = { i: 1, repeatStart: 1, pass: 1, ending: null };
	while (cursor.i <= last && order.length < MAX_BARS) step(cursor, at, last, order);
	return order;
}

function readMeasures(summary: string, warnings: string[]): Map<number, Marks> {
	const measures = new Map<number, Marks>();
	for (const raw of summary.split(/\r?\n/)) {
		const match = MEASURE.exec(raw.trim());
		if (!match) continue;
		const n = Number(match[1]);
		if (n < 1 || n > MAX_BARS) {
			warnings.push(`m${n}: a measure number out of range, left out`);
			continue;
		}
		measures.set(n, marksOf(match[2]!, n, warnings));
	}
	return measures;
}

const firstOf = <T>(measures: Map<number, Marks>, pick: (m: Marks) => T | null): T | null =>
	[...measures.keys()]
		.sort((a, b) => a - b)
		.map((n) => pick(measures.get(n)!))
		.find((v) => v !== null) ?? null;

export function chartBars(
	summary: string,
	defaults: { tempo: number | null; meter: string | null },
): ChartBars | null {
	const warnings: string[] = [];
	const measures = readMeasures(summary, warnings);
	if (measures.size === 0) return null;
	let bpm = defaults.tempo ?? firstOf(measures, (m) => m.tempo);
	if (bpm === null) return null;
	let meter = defaults.meter ?? firstOf(measures, (m) => m.meter);
	if (meter === null) {
		warnings.push("No time signature in the chart or the song: 4/4 assumed");
		meter = "4/4";
	}
	let key: string | null = null;
	const at = (n: number) => measures.get(n) ?? EMPTY;
	const order = playOrder(at, Math.max(...measures.keys()));
	if (order.length >= MAX_BARS) warnings.push(`The repeats run past ${MAX_BARS} bars; cut there`);
	const bars = order.map((measure) => {
		const m = at(measure);
		bpm = m.tempo ?? bpm!;
		meter = m.meter ?? meter!;
		key = m.key ?? key;
		return { measure, chords: m.chords, bpm, meter, key, section: m.section };
	});
	return { bars, warnings };
}
