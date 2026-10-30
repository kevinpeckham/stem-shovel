import type { ChartBar, ChartBars } from "./chartBars.js";
import { chartSectionName } from "./chartSectionName.js";
import { chartStatedValues } from "./chartStatedValues.js";
import { chordPitchClasses } from "./chordPitchClasses.js";

/**
 * A band's own markdown chord chart as the bars it plays, in the shape
 * `chartBars` gives a chart read (stem-bench Study 12: the chart rendered
 * as pads and aligned to the recording). The chart's conventions
 * (scripts/user-docs/charts-lyrics-and-notes.md "Tips for charts"): a
 * `## Heading` per section (also a lone "[Chorus]" or "Chorus:" line, or
 * "Intro: D A" ahead of the chords), grids such as `| D | A | Bm | G |`
 * with a bar per cell (two symbols split the bar, `%` or `/` alone plays
 * the previous bar again, N.C. is silence, an empty cell holds), bare lines
 * of chord symbols (a bar each), `x2` after a line or in a heading to play
 * it again, `|:` … `:|` around lines to repeat them once. A line is chords
 * only when every token reads as a chord symbol or a bar or repeat mark;
 * any other line is words (lyrics, notes), read only for a tempo ("120
 * bpm", "♩ = 120"), a time signature or a key ("Key: Bm", "key of E♭")
 * that applies from the next bar on. The chart's first stated tempo and
 * meter apply from the start, else the defaults (the song's settings);
 * null without a tempo or without a bar. Never throws: a grid line it
 * cannot read is a warning.
 */
type Line = { cells: string[][]; times: number | null; opens: boolean; closes: boolean };

interface State {
	bars: ChartBar[];
	warnings: string[];
	bpm: number;
	meter: string;
	key: string | null;
	section: string | null;
	sectionStart: number;
	sectionTimes: number;
	openAt: number | null;
}

const REPEAT_MARK = /\s*\(?\s*[x×]\s*(\d+)\s*\)?\s*$/i;
const NO_CHORD = /^n\.?c\.?$/i;
const KEY = /\b[Kk]ey(?:\s+of|\s*[:=])?\s+([A-G][#b♯♭]?)(major|minor|maj|min|m)?\b/;
const KEY_SPACED = /\b[Kk]ey(?:\s+of|\s*[:=])?\s+([A-G][#b♯♭]?)\s+(major|minor)\b/;
const PLAUSIBLE_METER = /^([1-9]|1[0-5])\/(2|4|8|16)$/;
/** A repeat count past this is a typo, not a form. */
const MAX_REPEAT = 8;

function keyOf(text: string): string | null {
	const m = KEY_SPACED.exec(text) ?? KEY.exec(text);
	if (!m) return null;
	const root = m[1]!.replace("#", "♯").replace(/(?<=[A-G])b/, "♭");
	return `${root} ${m[2]?.startsWith("m") && m[2] !== "major" && m[2] !== "maj" ? "minor" : "major"}`;
}

/** A cell's bar: its chord symbols, N.C. as "N.C.", the previous bar again for `%` or `/`; null when a token is not chord language. */
function cellChords(tokens: string[], previous: string[] | undefined): string[] | null {
	const chords: string[] = [];
	let again = false;
	for (const t of tokens) {
		if (t === "%" || t === "/") again = true;
		else if (NO_CHORD.test(t)) chords.push("N.C.");
		else if (chordPitchClasses(t)) chords.push(t);
		else return null;
	}
	return chords.length === 0 && again ? [...(previous ?? [])] : chords;
}

/** A line's repeat count, repeat signs and parts: a grid's cells, or a bare line's tokens. */
function shapeOf(raw: string) {
	const timesText = REPEAT_MARK.exec(raw)?.[1];
	const line = timesText ? raw.replace(REPEAT_MARK, "") : raw;
	const grid = line.includes("|");
	const bare = line.replace(/:\||\|:/g, "|");
	const parts = grid ? bare.split("|").map((c) => c.trim()) : bare.split(/\s+/);
	// A grid's edge bars leave empty text outside them.
	if (grid && parts[0] === "") parts.shift();
	if (grid && parts.at(-1) === "") parts.pop();
	return {
		times: timesText ? Number(timesText) : null,
		opens: line.replace(/:\|/g, " ").includes("|:"),
		closes: line.includes(":|"),
		grid,
		parts,
	};
}

/** Each part's bar, in order; null as soon as one is not chord language. */
function cellsOf(parts: string[], previous: string[] | undefined): string[][] | null {
	const cells: string[][] = [];
	for (const part of parts) {
		const chords = cellChords(part.split(/\s+/).filter(Boolean), cells.at(-1) ?? previous);
		if (!chords) return null;
		cells.push(chords);
	}
	return cells;
}

/** The line as bars when it is a chord line; "words" when it is not; "unreadable" for a grid with words in it. */
function readChordLine(raw: string, previous: string[] | undefined): Line | "words" | "unreadable" {
	const { times, opens, closes, grid, parts } = shapeOf(raw);
	const cells = cellsOf(parts, previous);
	if (!cells) return grid ? "unreadable" : "words";
	if (cells.length === 0 || (!grid && cells.every((c) => c.length === 0))) return "words";
	return { cells, times, opens, closes };
}

const clampTimes = (times: number) => Math.max(1, Math.min(MAX_REPEAT, times));

/** Plays bars[from…] again, `times - 1` more times; a line's copies carry no section, a section's do. */
function repeatFrom(s: State, from: number, times: number, keepSection: boolean): void {
	const once = s.bars.slice(from);
	for (let k = 1; k < clampTimes(times); k++)
		s.bars.push(...once.map((b) => ({ ...b, section: keepSection ? b.section : null })));
}

function endSection(s: State): void {
	if (s.sectionTimes > 1) repeatFrom(s, s.sectionStart, s.sectionTimes, true);
	s.openAt = null;
}

function startSection(s: State, name: string | null, times: number): void {
	endSection(s);
	s.section = name;
	s.sectionStart = s.bars.length;
	s.sectionTimes = times;
}

function applyMarks(s: State, text: string): void {
	const stated = chartStatedValues(text);
	if (stated.tempo !== null) s.bpm = stated.tempo;
	if (stated.meter && PLAUSIBLE_METER.test(stated.meter)) s.meter = stated.meter;
	s.key = keyOf(text) ?? s.key;
}

function emit(s: State, line: Line): void {
	const start = s.bars.length;
	if (line.opens) s.openAt = start;
	for (const chords of line.cells) {
		s.bars.push({ measure: 0, chords, bpm: s.bpm, meter: s.meter, key: s.key, section: s.section });
		s.section = null;
	}
	if (line.closes) repeatFrom(s, s.openAt ?? s.sectionStart, line.times ?? 2, false);
	else if (line.times) repeatFrom(s, start, line.times, false);
	if (line.closes) s.openAt = null;
}

function readHeading(s: State, text: string): void {
	const times = Number(REPEAT_MARK.exec(text)?.[1] ?? 1);
	const name = text
		.replace(REPEAT_MARK, "")
		.replace(/[:\s]+$/, "")
		.trim();
	applyMarks(s, name);
	startSection(s, name || null, times);
}

const LABEL = /^\[([^\]]+)\]\s*(.*)$|^([^:|[\]]+):\s*(.*)$/;

/** "Chorus:" or "[Chorus]" alone, or "Intro: D A" with the chords after it: a section starts; the rest of the line is read on. */
function readLabeled(s: State, line: string): string | null {
	const m = LABEL.exec(line);
	const label = m?.[1] ?? m?.[3];
	const name = label ? chartSectionName(label) : null;
	if (!name) return line;
	startSection(s, name, 1);
	return (m![2] ?? m![4] ?? "").trim() || null;
}

function readLine(s: State, raw: string, n: number): void {
	const heading = /^#{1,6}\s+(.*)$/.exec(raw);
	if (heading) return readHeading(s, heading[1]!);
	const line = readLabeled(s, raw);
	if (!line) return;
	const read = readChordLine(line, s.bars.at(-1)?.chords);
	if (read === "unreadable") s.warnings.push(`Line ${n}: "${raw}" has words in its grid; left out`);
	else if (read === "words") applyMarks(s, line);
	else emit(s, read);
}

export function chordChartBars(
	markdown: string,
	defaults: { tempo: number | null; meter: string | null },
): ChartBars | null {
	const stated = chartStatedValues(markdown);
	const bpm = stated.tempo ?? defaults.tempo;
	if (bpm === null) return null;
	const s: State = {
		bars: [],
		warnings: [],
		bpm,
		meter:
			stated.meter && PLAUSIBLE_METER.test(stated.meter) ? stated.meter : (defaults.meter ?? "4/4"),
		key: null,
		section: null,
		sectionStart: 0,
		sectionTimes: 1,
		openAt: null,
	};
	for (const [i, raw] of markdown.split(/\r?\n/).entries()) {
		const line = raw.trim();
		if (line && !line.startsWith("```")) readLine(s, line, i + 1);
	}
	endSection(s);
	if (s.bars.length === 0) return null;
	return { bars: s.bars.map((b, i) => ({ ...b, measure: i + 1 })), warnings: s.warnings };
}
