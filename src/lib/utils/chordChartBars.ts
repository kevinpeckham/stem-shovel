import type { ChartBar, ChartBars } from "./chartBars.js";
import { chartSectionName } from "./chartSectionName.js";
import { chartStatedValues } from "./chartStatedValues.js";
import { chordPitchClasses } from "./chordPitchClasses.js";

/**
 * A band's own markdown chord chart as the bars it plays, in the shape
 * `chartBars` gives a chart read (stem-bench Study 12: the chart rendered
 * as pads and aligned to the recording). The chart's conventions
 * (scripts/user-docs/writing-a-chord-chart.md): a section per heading, as
 * `## Verse`, a bold line (`**Verse**`), a numbered label (`II - Verse`,
 * bold or not; the numeral names the section in a Structure), a lone
 * "[Chorus]" or "Chorus:" line, or "Intro: D A" ahead of the chords. Bars
 * are the cells of a grid such as `| D | A | Bm | G |` or the parts of a
 * line between the band's dots (`A・D・E・A`); a bare line of chord symbols
 * is a bar each. Two symbols in a cell split the bar; `D5 x2` after a
 * chord plays that bar twice; `%` or `/` alone plays the previous bar
 * again; `--` or an empty cell holds; N.C. is silence; a word that is not
 * a chord in a bar of chords is ignored with a warning. `x2` after the
 * closing pipe (`| D | A | x2`) or in a heading plays the line or the
 * section again; `|:` … `:|` around lines repeat them once. A Structure
 * line (`Structure: Intro・Verse・Chorus x2・Outro`, or the label alone with
 * the outline on the next line) names the sections in play order, by
 * numeral or by name (a prefix is enough: "Out" for "Outro"), and the
 * chart is expanded in that order; an outline naming a section the chart
 * does not define is a warning and the chart is read as written. Any
 * other line is words (lyrics, notes), read only for a tempo ("120 bpm",
 * "bpm 120", "♩ = 120"), a time signature or a key ("Key: Bm", "key of E♭",
 * "key change -> B") that applies from the next bar on. The markdown
 * editor's escapes (`\|`, `\*`) are read through. The chart's first
 * stated tempo and meter apply from the start, else the defaults (the
 * song's settings); null without a tempo or without a bar. Never throws:
 * a grid line it cannot read is a warning.
 */
interface Cell {
	chords: string[];
	times: number;
}
type Line = { cells: Cell[]; times: number | null; opens: boolean; closes: boolean };

interface Section {
	numeral: string | null;
	name: string | null;
	start: number;
}

interface State {
	bars: ChartBar[];
	warnings: string[];
	bpm: number;
	meter: string;
	key: string | null;
	/** The section the next bar begins, until a bar takes it. */
	section: string | null;
	sections: Section[];
	sectionTimes: number;
	openAt: number | null;
	/** A Structure label read, its outline on the next line. */
	outlinePending: boolean;
	outline: { tokens: string[]; line: number } | null;
}

/** A repeat count after the closing pipe or at the start of a heading's tail: the line or section again. */
const LINE_REPEAT = /(^|\||:\|)\s*\(?\s*[x×]\s*(\d+)\s*\)?\s*$/i;
const HEADING_REPEAT = /\s*\(?\s*[x×]\s*(\d+)\s*\)?\s*$/i;
const NO_CHORD = /^n\.?c\.?$/i;
const HOLD = /^[-–—]+$/;
const KEY =
	/\b[Kk]ey(?:\s+change)?(?:\s+of|\s+to|\s*(?:->|→|[:=]))?\s+([A-G][#b♯♭]?)(major|minor|maj|min|m)?\b/;
const KEY_SPACED =
	/\b[Kk]ey(?:\s+change)?(?:\s+of|\s+to|\s*(?:->|→|[:=]))?\s+([A-G][#b♯♭]?)\s+(major|minor)\b/;
const PLAUSIBLE_METER = /^([1-9]|1[0-5])\/(2|4|8|16)$/;
/** A repeat count past this is a typo, not a form (a chord held 20 bars is a form). */
const MAX_REPEAT = 64;
/** A runaway expansion stops here; no song is this long. */
const MAX_BARS = 2000;
/** The band's dot between bars, or between the facts of a header line. */
const SEPARATORS = /[・·•]/g;
/** Markdown's escapes, as the in-app editor writes them (`\|`, `\*`, `\[`). */
const ESCAPE = /\\([\\`*_{}[\]()#+\-.!|<>~])/g;
const BOLD_LINE = /^\*\*(.+?)\*\*\s*$/;
/** A trailing footnote mark (`| C | G C | x4 **`). */
const FOOTNOTE = /\s+\*+$/;
/** "II - Verse", "2. Chorus": the numeral names the section in a Structure. */
const NUMBERED = /^([IVXLC]+|\d+)\s*[-–—.:]\s*(.+)$/;
/** The label alone, or with its outline after a colon; bold or not. */
const STRUCTURE = /^(?:structure|form|order|arrangement|play order)\s*(?::\s*(.*))?$/i;
const ROMAN: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100 };

function keyOf(text: string): string | null {
	const m = KEY_SPACED.exec(text) ?? KEY.exec(text);
	if (!m) return null;
	const root = m[1]!.replace("#", "♯").replace(/(?<=[A-G])b/, "♭");
	return `${root} ${m[2]?.startsWith("m") && m[2] !== "major" && m[2] !== "maj" ? "minor" : "major"}`;
}

/** "iv" → 4; null for a word that is not a roman numeral. */
function romanValue(word: string): number | null {
	const letters = word.toLowerCase();
	if (!/^[ivxlc]+$/.test(letters)) return null;
	let total = 0;
	for (let i = 0; i < letters.length; i++) {
		const v = ROMAN[letters[i]!]!;
		const next = ROMAN[letters[i + 1] ?? ""] ?? 0;
		total += v < next ? -v : v;
	}
	return total;
}

/** A name as compared: lower case, punctuation gone, numerals as digits ("Part I" and "part 1" agree). */
function normName(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^\p{L}\p{N} ]+/gu, " ")
		.split(/\s+/)
		.filter(Boolean)
		.map((w) => String(romanValue(w) ?? w))
		.join(" ");
}

/** A cell's trailing repeat ("D5 x2", "D(7)sus4 x 8") split from its tokens. */
function cellRepeat(tokens: string[]): { tokens: string[]; times: number } {
	const last = tokens.at(-1) ?? "";
	const joined = /^[x×](\d+)$/i.exec(last);
	if (joined && tokens.length > 1) return { tokens: tokens.slice(0, -1), times: Number(joined[1]) };
	const split = /^\d+$/.test(last) && /^[x×]$/i.test(tokens.at(-2) ?? "");
	if (split && tokens.length > 2) return { tokens: tokens.slice(0, -2), times: Number(last) };
	return { tokens, times: 1 };
}

/**
 * A cell's bar: its chord symbols, N.C. as "N.C.", the previous bar again
 * for `%` or `/`, a hold for `--` or nothing; words beside chords are
 * ignored (named for the warning); null when the cell is words alone.
 */
function cellChords(
	raw: string[],
	previous: string[] | undefined,
): { cell: Cell; ignored: string[] } | null {
	const { tokens, times } = cellRepeat(raw);
	const chords = tokens.flatMap(chordOf);
	const ignored = tokens.filter((t) => tokenKind(t) === "word");
	if (chords.length === 0 && ignored.length > 0) return null;
	const again = tokens.some((t) => tokenKind(t) === "again");
	const bar = chords.length === 0 && again ? [...(previous ?? [])] : chords;
	return { cell: { chords: bar, times }, ignored };
}

type TokenKind = "again" | "hold" | "chord" | "word";

function tokenKind(t: string): TokenKind {
	if (t === "%" || t === "/") return "again";
	if (HOLD.test(t)) return "hold";
	return NO_CHORD.test(t) || chordPitchClasses(t) ? "chord" : "word";
}

/** A token's chord symbol (N.C. normalized), or nothing. */
function chordOf(t: string): string[] {
	if (tokenKind(t) !== "chord") return [];
	return [NO_CHORD.test(t) ? "N.C." : t];
}

/** A bare line's tokens as bars: a chord each, its "x2" or "x 2" kept with it. */
function bareParts(tokens: string[]): string[] {
	const parts: string[] = [];
	for (const t of tokens) {
		const previous = parts.at(-1);
		const count = /^[x×]\d*$/i.test(t) || (/^\d+$/.test(t) && /\s[x×]$/i.test(previous ?? ""));
		if (count && previous !== undefined) parts[parts.length - 1] = `${previous} ${t}`;
		else parts.push(t);
	}
	return parts;
}

/** A line's repeat count, repeat signs and parts: a grid's cells, or a bare line's tokens. */
function shapeOf(raw: string) {
	const repeat = LINE_REPEAT.exec(raw);
	const line = repeat ? raw.slice(0, repeat.index) + repeat[1] : raw;
	const grid = line.includes("|");
	const bare = line.replace(/:\||\|:/g, "|");
	const parts = grid ? bare.split("|").map((c) => c.trim()) : bareParts(bare.split(/\s+/));
	// A grid's edge bars leave empty text outside them.
	if (grid && parts[0] === "") parts.shift();
	if (grid && parts.at(-1) === "") parts.pop();
	return {
		times: repeat ? Number(repeat[2]) : null,
		opens: line.replace(/:\|/g, " ").includes("|:"),
		closes: line.includes(":|"),
		grid,
		parts,
	};
}

/** Each part's bar, in order, and the words ignored in them; null as soon as a part is words alone. */
function cellsOf(
	parts: string[],
	previous: string[] | undefined,
): { cells: Cell[]; ignored: string[] } | null {
	const cells: Cell[] = [];
	const ignored: string[] = [];
	for (const part of parts) {
		const read = cellChords(part.split(/\s+/).filter(Boolean), cells.at(-1)?.chords ?? previous);
		if (!read) return null;
		cells.push(read.cell);
		ignored.push(...read.ignored);
	}
	return { cells, ignored };
}

type Read = { line: Line; ignored: string[] } | "words" | "unreadable";

/** The line as bars when it is a chord line; "words" when it is not; "unreadable" for a grid with words in it. */
function readChordLine(raw: string, previous: string[] | undefined): Read {
	const dotted = SEPARATORS.test(raw);
	SEPARATORS.lastIndex = 0;
	const { times, opens, closes, grid, parts } = shapeOf(raw.replace(SEPARATORS, " | "));
	const read = cellsOf(parts, previous);
	// A line of dots alone that is not chords is a header or a note, not a broken grid.
	if (!read) return grid && !dotted ? "unreadable" : "words";
	if (read.cells.length === 0 || (!grid && read.cells.every((c) => c.chords.length === 0)))
		return "words";
	return { line: { cells: read.cells, times, opens, closes }, ignored: read.ignored };
}

const clampTimes = (times: number) => Math.max(1, Math.min(MAX_REPEAT, times));

function push(s: State, bars: ChartBar[]): void {
	for (const bar of bars) {
		if (s.bars.length >= MAX_BARS) return;
		s.bars.push(bar);
	}
}

/** Plays bars[from…] again, `times - 1` more times; a line's copies carry no section, a section's do. */
function repeatFrom(s: State, from: number, times: number, keepSection: boolean): void {
	const once = s.bars.slice(from);
	for (let k = 1; k < clampTimes(times); k++)
		push(
			s,
			once.map((b) => ({ ...b, section: keepSection ? b.section : null })),
		);
}

const sectionStart = (s: State) => s.sections.at(-1)?.start ?? 0;

function endSection(s: State): void {
	if (s.sectionTimes > 1) repeatFrom(s, sectionStart(s), s.sectionTimes, true);
	s.openAt = null;
}

function startSection(s: State, numeral: string | null, name: string | null, times: number): void {
	endSection(s);
	s.section = name;
	s.sections.push({ numeral, name, start: s.bars.length });
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
	for (const cell of line.cells) {
		const bar = { measure: 0, chords: cell.chords, bpm: s.bpm, meter: s.meter, key: s.key };
		push(s, [{ ...bar, section: s.section }]);
		s.section = null;
		for (let k = 1; k < clampTimes(cell.times); k++) push(s, [{ ...bar, section: null }]);
	}
	if (line.closes) repeatFrom(s, s.openAt ?? sectionStart(s), line.times ?? 2, false);
	else if (line.times) repeatFrom(s, start, line.times, false);
	if (line.closes) s.openAt = null;
}

/** A heading's text: its repeat count, its numeral ("II - Verse") and its name, marks read from the whole. */
function readHeading(s: State, text: string): void {
	const times = Number(HEADING_REPEAT.exec(text)?.[1] ?? 1);
	const label = text
		.replace(HEADING_REPEAT, "")
		.replace(/[:\s]+$/, "")
		.trim();
	applyMarks(s, label);
	const numbered = NUMBERED.exec(label);
	const name = (numbered ? numbered[2]! : label).replace(/\s*\([^)]*\)\s*$/, "").trim();
	startSection(s, numbered ? numbered[1]! : null, name || null, times);
}

/** "Structure: Intro・Verse…" or the label alone (the outline follows on the next line). */
function readStructure(s: State, rest: string, n: number): void {
	if (rest.trim()) readOutline(s, rest, n);
	else s.outlinePending = true;
}

function readOutline(s: State, text: string, n: number): void {
	s.outlinePending = false;
	const tokens = text
		.split(/[・·•,|]|->|→|\s{2,}/)
		.map((t) => t.trim())
		.filter(Boolean);
	if (tokens.length > 0) s.outline = { tokens, line: n };
}

const LABEL = /^\[([^\]]+)\]\s*(.*)$|^([^:|[\]]+):\s*(.*)$/;

/** "Chorus:" or "[Chorus]" alone, or "Intro: D A" with the chords after it: a section starts; the rest of the line is read on. */
function readLabeled(s: State, line: string): string | null {
	const m = LABEL.exec(line);
	const label = m?.[1] ?? m?.[3];
	const name = label ? chartSectionName(label) : null;
	if (!name) return line;
	startSection(s, null, name, 1);
	return (m![2] ?? m![4] ?? "").trim() || null;
}

/** A bold line, a numbered label or a section word alone is a heading; the text to read as one, or null. */
function headingText(line: string): string | null {
	const bold = BOLD_LINE.exec(line);
	if (bold) return bold[1]!.trim();
	if (NUMBERED.test(line) && !line.includes("|")) return line;
	return chartSectionName(line);
}

/** A heading, a Structure label or an outline line, read; false when the line is none of these. */
function readStructural(s: State, raw: string, n: number): boolean {
	const heading = /^#{1,6}\s+(.*)$/.exec(raw);
	if (heading) readHeading(s, heading[1]!);
	else if (s.outlinePending) readOutline(s, raw, n);
	else {
		const text = headingText(raw);
		const structure = STRUCTURE.exec(text ?? raw);
		if (structure) readStructure(s, structure[1] ?? "", n);
		else if (text !== null) readHeading(s, text);
		else return false;
	}
	return true;
}

function readLine(s: State, escaped: string, n: number): void {
	const raw = escaped.replace(ESCAPE, "$1");
	if (readStructural(s, raw, n)) return;
	const line = readLabeled(s, raw.replace(FOOTNOTE, ""));
	if (!line) return;
	const read = readChordLine(line, s.bars.at(-1)?.chords);
	if (read === "unreadable") s.warnings.push(`Line ${n}: "${raw}" has words in its grid; left out`);
	else if (read === "words") applyMarks(s, line);
	else {
		if (read.ignored.length > 0)
			s.warnings.push(
				`Line ${n}: ${read.ignored.map((w) => `"${w}"`).join(", ")} is not a chord; ignored`,
			);
		emit(s, read.line);
	}
}

/** The section an outline token names: by numeral, by name, else by a prefix either way; null when none or several. */
function sectionFor(token: string, sections: Section[]): Section | null | "ambiguous" {
	const roman = romanValue(token);
	const byNumeral = sections.filter((x) => x.numeral && romanValue(x.numeral) === roman);
	if (roman !== null && byNumeral.length === 1) return byNumeral[0]!;
	const want = normName(token);
	const named = sections.filter((x) => x.name && normName(x.name) === want);
	if (named.length === 1) return named[0]!;
	if (want.length < 3) return null;
	const prefixed = sections.filter((x) => {
		const have = x.name ? normName(x.name) : "";
		return have.length >= 3 && (have.startsWith(want) || want.startsWith(have));
	});
	return prefixed.length === 1 ? prefixed[0]! : prefixed.length === 0 ? null : "ambiguous";
}

/** An outline token's section and repeat count ("Chorus x2"). */
function outlineEntry(
	token: string,
	sections: Section[],
): { section: Section | null | "ambiguous"; times: number } {
	const m = HEADING_REPEAT.exec(token);
	const name = m ? token.slice(0, m.index).trim() : token;
	return { section: sectionFor(name, sections), times: clampTimes(Number(m?.[1] ?? 1)) };
}

/** The bars of each defined section (the bars before the first heading stay in front). */
function barsBySection(s: State): Map<Section, ChartBar[]> {
	const out = new Map<Section, ChartBar[]>();
	s.sections.forEach((section, i) => {
		const end = s.sections[i + 1]?.start ?? s.bars.length;
		out.set(section, s.bars.slice(section.start, end));
	});
	return out;
}

/** The chart in its Structure's order, each play beginning its section; nothing when a token resolves to no section. */
function expandOutline(s: State): void {
	if (!s.outline) return;
	const { tokens, line } = s.outline;
	const entries = tokens.map((t) => ({ token: t, ...outlineEntry(t, s.sections) }));
	const bad = entries.find((e) => !e.section || e.section === "ambiguous");
	if (bad) {
		const why =
			bad.section === "ambiguous" ? "fits more than one section" : "is no section of the chart";
		s.warnings.push(
			`Line ${line}: the Structure names "${bad.token}", which ${why}; the chart is read in the order written`,
		);
		return;
	}
	const by = barsBySection(s);
	const bars = s.bars.slice(0, s.sections[0]?.start ?? s.bars.length);
	for (const e of entries) {
		const once = by.get(e.section as Section)!;
		for (let k = 0; k < e.times && bars.length < MAX_BARS; k++)
			bars.push(
				...once.map((b, i) => ({ ...b, section: i === 0 ? (e.section as Section).name : null })),
			);
	}
	s.bars = bars;
}

export function chordChartBars(
	markdown: string,
	defaults: { tempo: number | null; meter: string | null },
): ChartBars | null {
	const stated = chartStatedValues(markdown.replace(ESCAPE, "$1"));
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
		sections: [],
		sectionTimes: 1,
		openAt: null,
		outlinePending: false,
		outline: null,
	};
	for (const [i, raw] of markdown.split(/\r?\n/).entries()) {
		const line = raw.trim();
		if (line && !line.startsWith("```")) readLine(s, line, i + 1);
	}
	endSection(s);
	expandOutline(s);
	if (s.bars.length === 0) return null;
	return { bars: s.bars.map((b, i) => ({ ...b, measure: i + 1 })), warnings: s.warnings };
}
