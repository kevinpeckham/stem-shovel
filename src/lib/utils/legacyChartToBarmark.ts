import { parseChart, parseChord } from "barmark";
import { chartSectionName } from "./chartSectionName.js";
import { chartStatedValues } from "./chartStatedValues.js";

/**
 * A chart in the band's old idiom (the one `chordChartBars` reads) written
 * in barmark (docs/barmark-adoption-plan.md, Scope 2; the grammar's
 * section 10), mechanically, refusing rather than guessing: anything it
 * cannot convert one way only is a reason, and a refused chart is left for
 * a human. Converted: the editor's escapes; a trailing footnote mark on a
 * bar line (dropped, noted); the header (`key: F#maj・4/4・bpm 132`) as
 * `key: F#, time: 4/4, tempo: 132`; bold, numbered and lone section labels
 * as `## <label>`; dot-separated and bare chord lines as pipe lines; `x N`
 * after a chord as that bar N times, after the closing pipe as a line
 * repeat; `%` or `/` alone as `%`; `--` as `--`; the Logic-style spellings
 * (`F♯(5)(7)` → `F#5(7)`, `D(7)Sus4` → `D7sus4`); a heading's
 * "(key change -> B)" as a `key:` line before it; and a Structure outline
 * as play order: each written section where it first plays, a bare replay
 * heading (`## II - Verse x2`) after that. Refused: N.C. (silence or no
 * harmony is a human's call), a word beside chords, a text line stating a
 * tempo, key or meter, an outline entry that names no section or several,
 * an outline that plays sections out of their written order or leaves one
 * out, and any output barmark reads with an error or as no bars.
 */
export type LegacyChartConversion =
	| { ok: true; text: string; notes: string[] }
	| { ok: false; reasons: string[]; text: string | null };

interface Section {
	/** The heading as it will be written, without `## `. */
	label: string;
	numeral: string | null;
	name: string;
	times: number;
	/** A `key:` line written before the heading (a key change in its label). */
	before: string | null;
	/** It sets a directive, so what plays after it is in its key or tempo. */
	changes: boolean;
	body: string[];
	written: number;
}

interface State {
	pre: string[];
	sections: Section[];
	outline: { entries: string[]; line: number } | null;
	outlinePending: boolean;
	reasons: string[];
	notes: string[];
}

const EDITOR_ESCAPE = /\\([|*_[\]#])/g;
const SEPARATORS = /[・·•]/;
const SEPARATORS_G = /[・·•]/g;
const BOLD_LINE = /^\*\*(.+?)\*\*$/;
const FOOTNOTE = /\s+\*+$/;
const NUMBERED = /^([IVXLC]+|\d+)\s*[-–—.:]\s*(.+)$/;
const STRUCTURE = /^(?:structure|form|order|arrangement|play order)\s*(?::\s*(.*))?$/i;
const HEADING_REPEAT = /\s*\(?\s*[x×]\s*(\d+)\s*\)?\s*$/i;
const LINE_REPEAT = /(\||:\|)\s*[x×]\s*(\d+)\s*$/i;
const LABEL = /^\[([^\]]+)\]\s*(.*)$|^([^:|[\]]+):\s*(.*)$/;
const KEY_CHANGE = /\s*\(\s*key change\s*(?:->|→|to)\s*([^)]*)\)\s*/i;
const KEY_VALUE = /^([A-G])([#b♯♭]?)\s*(major|minor|maj|min|m)?$/;
const NO_CHORD = /^n\.?c\.?$/i;
const SILENCE = /^(?:--|–|—)$/;
const ROMAN: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100 };

const quote = (s: string) => `"${s}"`;

/** "F#maj" → "F#", "Emin" / "E minor" / "Em" → "Em"; null for any other form. */
function barmarkKey(text: string): string | null {
	const m = KEY_VALUE.exec(text.trim());
	if (!m) return null;
	const root = `${m[1]}${m[2]!.replace("♯", "#").replace("♭", "b")}`;
	const minor = m[3] !== undefined && /^m(?:in(?:or)?)?$/.test(m[3]);
	return minor ? `${root}m` : root;
}

/** One fact of a header line, as a directive; null when it is none of key, meter and tempo. */
function headerPart(part: string): [string, string] | "bad-key" | null {
	const key = /^key\s*:?\s*(.+)$/i.exec(part);
	if (key) return barmarkKey(key[1]!) ? ["key", barmarkKey(key[1]!)!] : "bad-key";
	const time = /^(\d{1,2})\/(\d{1,2})$/.exec(part);
	if (time) return ["time", `${time[1]}/${time[2]}`];
	const tempo = /^(?:bpm\s*[:=]?\s*(\d{1,3})|(\d{1,3})\s*bpm)$/i.exec(part);
	if (tempo) return ["tempo", tempo[1] ?? tempo[2]!];
	return null;
}

/** A header line (`Key: D · 145 bpm`) as a barmark directive line; null when the line is no header; a reason when it is one it cannot convert. */
function readHeader(line: string, n: number): { directive: string } | { reason: string } | null {
	const parts = line
		.split(/[・·•,]/)
		.map((p) => p.trim())
		.filter(Boolean);
	const read = parts.map(headerPart);
	const isHeader = /^key\s*:/i.test(line) || (read.length > 0 && read.every((r) => r !== null));
	if (!isHeader) return null;
	const bad = parts.find((_, i) => read[i] === null || read[i] === "bad-key");
	if (bad !== undefined)
		return {
			reason: `Line ${n}: the header part ${quote(bad)} is no key, meter or tempo barmark has`,
		};
	const facts = new Map(read as [string, string][]);
	const order = ["key", "time", "tempo"].filter((k) => facts.has(k));
	return { directive: order.map((k) => `${k}: ${facts.get(k)}`).join(", ") };
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

/** A name as the old parser compares it: lower case, punctuation gone, numerals as digits. */
function normName(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^\p{L}\p{N} ]+/gu, " ")
		.split(/\s+/)
		.filter(Boolean)
		.map((w) => String(romanValue(w) ?? w))
		.join(" ");
}

/** A legacy chord symbol in barmark's spelling: `F♯(5)(7)` → `F#5(7)`, `D(7)Sus4` → `D7sus4`, `C#(7)` → `C#7`. */
function barmarkChord(token: string): string {
	const t = token.replace(/♯/g, "#").replace(/♭/g, "b").replace(/Sus/g, "sus");
	const m = /^([A-G][#b]?)((?:\(\d+\))+)(.*)$/.exec(t);
	if (!m) return t;
	const groups = [...m[2]!.matchAll(/\((\d+)\)/g)].map((g) => g[1]!);
	let head = m[1]!;
	if (groups[0] === "5" || groups[0] === "7") head += groups.shift();
	return `${head}${groups.length > 0 ? `(${groups.join(",")})` : ""}${m[3]}`;
}

type Token =
	| { kind: "chord"; text: string }
	| { kind: "again" | "hold" | "silence" | "nc" }
	| { kind: "word"; text: string; why: string | null };

function tokenOf(raw: string): Token {
	if (raw === "%") return { kind: "again" };
	if (raw === "/") return { kind: "hold" };
	if (SILENCE.test(raw)) return { kind: "silence" };
	if (NO_CHORD.test(raw)) return { kind: "nc" };
	const chord = barmarkChord(raw);
	const read = parseChord(chord);
	if (read.ok) return { kind: "chord", text: chord };
	return { kind: "word", text: raw, why: /^[A-G]/.test(raw) ? read.error.message : null };
}

/** A cell's trailing `x N` / `x2`: the bar that many times. */
function cellRepeat(tokens: string[]): { tokens: string[]; times: number } {
	const last = tokens.at(-1) ?? "";
	const joined = /^[x×](\d+)$/i.exec(last);
	if (joined && tokens.length > 1) return { tokens: tokens.slice(0, -1), times: Number(joined[1]) };
	if (/^\d+$/.test(last) && /^[x×]$/i.test(tokens.at(-2) ?? "") && tokens.length > 2)
		return { tokens: tokens.slice(0, -2), times: Number(last) };
	return { tokens, times: 1 };
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

interface CellRead {
	cells: { slots: Token[]; times: number }[];
	chords: number;
	words: Extract<Token, { kind: "word" }>[];
	nc: boolean;
	empty: number;
}

function readCells(parts: string[]): CellRead {
	const out: CellRead = { cells: [], chords: 0, words: [], nc: false, empty: 0 };
	for (const part of parts) {
		const { tokens, times } = cellRepeat(part.split(/\s+/).filter(Boolean));
		const slots = tokens.map(tokenOf);
		if (slots.length === 0) out.empty++;
		for (const s of slots) {
			if (s.kind === "chord") out.chords++;
			else if (s.kind === "word") out.words.push(s);
			else if (s.kind === "nc") out.nc = true;
		}
		out.cells.push({ slots, times });
	}
	return out;
}

/** A cell as barmark writes it: `%` alone, a repeated name as `/` (§10), an empty cell as a hold. */
function cellText(slots: Token[], notes: { repeated: boolean }): string {
	if (slots.length === 0) return "/";
	// `/` alone meant the previous bar in the old idiom; in barmark it is a hold.
	if (slots.length === 1 && (slots[0]!.kind === "again" || slots[0]!.kind === "hold")) return "%";
	let previous: string | null = null;
	return slots
		.map((s) => {
			if (s.kind !== "chord") {
				previous = null;
				return s.kind === "silence" ? "--" : s.kind === "hold" ? "/" : "%";
			}
			const same = s.text === previous;
			previous = s.text;
			if (same) notes.repeated = true;
			return same ? "/" : s.text;
		})
		.join(" ");
}

type ChordLine = { bars: string; notes: string[] } | { reason: string } | "text";

/** A line of chords (pipes, dots or bare symbols) as a barmark bar line; "text" when it is words. */
/** A line's shape: its repeat count, repeat signs and parts (a grid's cells, the dots' bars, or a bare line's tokens). */
function lineShape(line: string) {
	const repeat = LINE_REPEAT.exec(line);
	const body = repeat ? line.slice(0, repeat.index) + repeat[1] : line;
	const dotted = SEPARATORS.test(body);
	const grid = body.includes("|") || dotted;
	const spaced = body.replace(SEPARATORS_G, " | ").trim();
	const inner = spaced.replace(/^\|:?/, "").replace(/:?\|$/, "");
	return {
		times: repeat ? repeat[2]! : null,
		dotted,
		grid,
		opens: spaced.startsWith("|:"),
		closes: spaced.endsWith(":|"),
		inner,
		parts: grid ? inner.split("|").map((c) => c.trim()) : bareParts(inner.split(/\s+/)),
	};
}

/** Why a line of cells cannot convert, "text" when it is words, or null when it converts. */
function refusalOf(
	read: CellRead,
	shape: ReturnType<typeof lineShape>,
	line: string,
	n: number,
): { reason: string } | "text" | null {
	if (/\|:|:\|/.test(shape.inner))
		return { reason: `Line ${n}: a repeat sign inside ${quote(line)}; a human places it` };
	if (read.chords === 0)
		return !shape.grid || shape.dotted
			? "text"
			: { reason: `Line ${n}: ${quote(line)} is a grid with no chord barmark reads` };
	if (read.nc)
		return {
			reason: `Line ${n}: N.C. in ${quote(line)}; a human says whether the band is silent (--) or plays no harmony (N.C.)`,
		};
	const w = read.words[0];
	if (w)
		return {
			reason: `Line ${n}: ${quote(w.text)} is not a chord${w.why ? ` (${w.why})` : ""}, beside chords in ${quote(line)}`,
		};
	return null;
}

/** A line of chords (pipes, dots or bare symbols) as a barmark bar line; "text" when it is words. */
function readChordLine(line: string, n: number): ChordLine {
	const shape = lineShape(line);
	const read = readCells(shape.parts);
	const refusal = refusalOf(read, shape, line, n);
	if (refusal) return refusal;
	const flags = { repeated: false };
	const cells = read.cells.flatMap((c) => Array<string>(c.times).fill(cellText(c.slots, flags)));
	const notes: string[] = [];
	if (flags.repeated) notes.push(`Line ${n}: a repeated chord name in a bar written as \`/\``);
	if (read.empty > 0) notes.push(`Line ${n}: an empty cell (a hold) written as \`/\``);
	const open = shape.opens ? "|:" : "|";
	const close = shape.closes ? ":|" : "|";
	return {
		bars: `${open} ${cells.join(" | ")} ${close}${shape.times ? ` x${shape.times}` : ""}`,
		notes,
	};
}

function current(s: State): string[] {
	return s.sections.at(-1)?.body ?? s.pre;
}

/** A heading's text (bold marks gone) as a section: its label, numeral and name, and a key change in it as a `key:` line. */
function startSection(s: State, text: string, n: number): void {
	let label = text.trim();
	let before: string | null = null;
	const change = KEY_CHANGE.exec(label);
	if (change) {
		const key = barmarkKey(change[1]!);
		if (key) {
			before = `key: ${key}`;
			label = label.replace(KEY_CHANGE, " ").replace(/\s+/g, " ").trim();
			s.notes.push(
				`Line ${n}: the key change in ${quote(text)} written as \`${before}\` before it`,
			);
		} else s.reasons.push(`Line ${n}: the key change in ${quote(text)} names no key barmark has`);
	} else if (/\bkey\b|\bbpm\b/i.test(label))
		s.reasons.push(
			`Line ${n}: the heading ${quote(text)} states a key or tempo; a human writes it`,
		);
	const repeat = HEADING_REPEAT.exec(label);
	const bare = (repeat ? label.slice(0, repeat.index) : label).replace(/[:\s]+$/, "").trim();
	const numbered = NUMBERED.exec(bare);
	const name = (numbered ? numbered[2]! : bare).replace(/\s*\([^)]*\)\s*$/, "").trim();
	s.sections.push({
		label,
		numeral: numbered ? numbered[1]! : null,
		name,
		times: repeat ? Number(repeat[1]) : 1,
		before,
		changes: before !== null,
		body: [],
		written: s.sections.length,
	});
}

function readOutline(s: State, text: string, n: number): void {
	s.outlinePending = false;
	if (s.outline) s.reasons.push(`Line ${n}: a second Structure line`);
	const entries = text
		.split(/[・·•,|]|->|→|\s{2,}/)
		.map((t) => t.trim())
		.filter(Boolean);
	if (entries.length > 0) s.outline = { entries, line: n };
}

/** The heading text a line is, or null: a markdown `##`, a bold line, a numbered label, a section word alone. */
function headingText(line: string): string | null {
	const md = /^##\s+(.*)$/.exec(line);
	if (md) return md[1]!.trim();
	const bold = BOLD_LINE.exec(line);
	if (bold) return bold[1]!.trim();
	if (NUMBERED.test(line) && !line.includes("|")) return line;
	return chartSectionName(line);
}

/** A heading, a Structure label or its outline line; false when the line is none of these. */
function readStructural(s: State, line: string, n: number): boolean {
	if (s.outlinePending) {
		readOutline(s, line, n);
		return true;
	}
	if (/^#(?:#{2,})?\s/.test(line)) {
		s.reasons.push(`Line ${n}: ${quote(line)} is a heading of a level barmark reads otherwise`);
		return true;
	}
	const text = headingText(line);
	const structure = STRUCTURE.exec(text ?? line);
	if (structure) {
		if (structure[1]?.trim()) readOutline(s, structure[1], n);
		else s.outlinePending = true;
		return true;
	}
	if (text === null) return false;
	startSection(s, text, n);
	return true;
}

function readDirective(s: State, header: { directive: string } | { reason: string }): void {
	if ("reason" in header) {
		s.reasons.push(header.reason);
		return;
	}
	current(s).push(header.directive);
	const section = s.sections.at(-1);
	if (section) section.changes = true;
}

/** A text line, kept; one that states a tempo, meter or key the old parser read is refused. */
function readText(s: State, line: string, n: number): void {
	const stated = chartStatedValues(line);
	if (stated.tempo !== null || stated.meter !== null || /\bkey\b/i.test(line))
		s.reasons.push(
			`Line ${n}: the text ${quote(line)} states a tempo, meter or key; a human writes it`,
		);
	current(s).push(line);
}

function readBody(s: State, line: string, n: number): void {
	const header = readHeader(line, n);
	if (header) return readDirective(s, header);
	const footnote = FOOTNOTE.exec(line);
	const read = readChordLine(footnote ? line.slice(0, footnote.index) : line, n);
	if (read === "text") return readText(s, line, n);
	if ("reason" in read) {
		s.reasons.push(read.reason);
		current(s).push(line);
		return;
	}
	if (footnote) s.notes.push(`Line ${n}: dropped the footnote mark ${quote(footnote[0].trim())}`);
	s.notes.push(...read.notes);
	current(s).push(read.bars);
}

function readLine(s: State, raw: string, n: number): void {
	const line = raw.trim();
	if (!line || line.startsWith("```")) {
		if (!s.outlinePending) current(s).push(line);
		return;
	}
	if (readStructural(s, line, n)) return;
	const labeled = LABEL.exec(line);
	const name = labeled ? chartSectionName((labeled[1] ?? labeled[3])!) : null;
	if (labeled && name) {
		startSection(s, name, n);
		const rest = (labeled[2] ?? labeled[4] ?? "").trim();
		if (rest) readBody(s, rest, n);
		return;
	}
	readBody(s, line, n);
}

/** The section an outline entry names: by numeral, by name, else by a prefix either way. */
function sectionFor(token: string, sections: Section[]): Section | null | "ambiguous" {
	const roman = romanValue(token);
	const byNumeral = sections.filter((x) => x.numeral && romanValue(x.numeral) === roman);
	if (roman !== null && byNumeral.length === 1) return byNumeral[0]!;
	const want = normName(token);
	const named = sections.filter((x) => normName(x.name) === want);
	if (named.length === 1) return named[0]!;
	if (named.length > 1) return "ambiguous";
	if (want.length < 3) return null;
	const prefixed = sections.filter((x) => {
		const have = normName(x.name);
		return have.length >= 3 && (have.startsWith(want) || want.startsWith(have));
	});
	if (prefixed.length === 0) return null;
	return prefixed.length === 1 ? prefixed[0]! : "ambiguous";
}

const matchKey = (label: string) => label.toLowerCase().replace(/\s+/g, " ").trim();

function trimmed(lines: string[]): string[] {
	const out = [...lines];
	while (out.length > 0 && out.at(-1) === "") out.pop();
	while (out.length > 0 && out[0] === "") out.shift();
	return out;
}

function written(section: Section, times: number): string[] {
	const heading = `## ${section.label}${times > 1 ? ` x${times}` : ""}`;
	return [...(section.before ? [section.before] : []), heading, ...trimmed(section.body)];
}

/** The outline's entries as sections in play order; null (with reasons) when any cannot be placed mechanically. */
function playOrder(s: State): { section: Section; times: number }[] | null {
	const { entries, line } = s.outline!;
	const plays: { section: Section; times: number }[] = [];
	const bad = new Set<string>();
	for (const entry of entries) {
		const m = HEADING_REPEAT.exec(entry);
		const token = m ? entry.slice(0, m.index).trim() : entry;
		const section = sectionFor(token, s.sections);
		if (section && section !== "ambiguous") plays.push({ section, times: Number(m?.[1] ?? 1) });
		else if (!bad.has(entry)) {
			bad.add(entry);
			const why = section === "ambiguous" ? "fits more than one section" : "matches no section";
			s.reasons.push(`Line ${line}: the Structure names ${quote(entry)}, which ${why}`);
		}
	}
	if (bad.size > 0) return null;
	return checkPlayOrder(s, plays) ? plays : null;
}

/** Whether barmark's written-order-is-play-order can say this outline: first plays in written order, every section played, names distinct. */
function checkPlayOrder(s: State, plays: { section: Section; times: number }[]): boolean {
	const line = s.outline!.line;
	const before = s.reasons.length;
	const first = [...new Set(plays.map((p) => p.section))];
	first.forEach((section, i) => {
		if (section.written !== i)
			s.reasons.push(
				`Line ${line}: the Structure first plays ${quote(section.label)} out of the written order; moving sections is a human's call`,
			);
	});
	for (const section of s.sections) {
		if (!first.includes(section))
			s.reasons.push(`Line ${line}: the Structure never plays ${quote(section.label)}`);
		if (section.times > 1)
			s.reasons.push(
				`Line ${line}: ${quote(section.label)} repeats in its heading and in the Structure`,
			);
	}
	const keys = s.sections.map((x) => matchKey(x.label.replace(HEADING_REPEAT, "")));
	if (new Set(keys).size !== keys.length)
		s.reasons.push(`Line ${line}: two sections share a heading, so a replay could not say which`);
	const change = plays.findIndex((p) => p.section.changes);
	if (change >= 0) {
		const from = plays[change]!.section.written;
		const late = plays.slice(change).find((p) => p.section.written < from);
		if (late)
			s.reasons.push(
				`Line ${line}: ${quote(late.section.label)} replays after the key or tempo change in ${quote(plays[change]!.section.label)}`,
			);
	}
	return s.reasons.length === before;
}

function emit(s: State): string {
	const out = trimmed(s.pre);
	const push = (lines: string[]) => {
		if (out.length > 0) out.push("");
		out.push(...lines);
	};
	const plays = s.outline ? playOrder(s) : null;
	if (plays) {
		const seen = new Set<Section>();
		for (const { section, times } of plays) {
			if (seen.has(section)) push([`## ${section.label}${times > 1 ? ` x${times}` : ""}`]);
			else push(written(section, times));
			seen.add(section);
		}
		s.notes.push(
			`Line ${s.outline!.line}: the Structure written as play order, later plays as replay headings`,
		);
	} else for (const section of s.sections) push(written(section, section.times));
	return `${out.join("\n")}\n`;
}

export function legacyChartToBarmark(markdown: string): LegacyChartConversion {
	const s: State = {
		pre: [],
		sections: [],
		outline: null,
		outlinePending: false,
		reasons: [],
		notes: [],
	};
	const unescaped = markdown.replace(EDITOR_ESCAPE, "$1");
	if (unescaped !== markdown) s.notes.push("the editor's escapes removed");
	const lines = unescaped.split(/\r?\n/);
	lines.forEach((line, i) => readLine(s, line, i + 1));
	if (s.outlinePending) s.reasons.push("a Structure label with no outline after it");
	const text = emit(s);
	if (s.reasons.length > 0) return { ok: false, reasons: s.reasons, text };
	const parsed = parseChart(text);
	const errors = parsed.diagnostics.filter((d) => d.severity === "error");
	if (errors.length > 0)
		return {
			ok: false,
			reasons: errors.map((d) => `barmark, line ${d.line}: ${d.message} (${d.token})`),
			text,
		};
	if (parsed.bars.length === 0) return { ok: false, reasons: ["barmark reads no bars"], text };
	return { ok: true, text, notes: s.notes };
}
