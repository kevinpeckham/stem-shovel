import { parseChart } from "barmark";
import type { ChartParse, Key, PlayedBar, SimpleSlot, Slot } from "barmark";
import { chartDiagnosticText } from "./chartDiagnosticText.js";
import { chartSectionName } from "./chartSectionName.js";

/**
 * A chart as the bars it plays, in play order (stem-bench Study 12: the
 * chart rendered as chord pads at its declared tempo and aligned to the
 * recording places every bar in seconds). `barmarkChartBars` reads every
 * chart the app keeps into this shape, the band's chord chart and a score's
 * read alike; `chartBars` reads the legacy `m<n>` measure summary.
 */
export interface ChartBar {
	/** The bar's number as written, 1-based (a repeat plays a bar again under its own number). */
	measure: number;
	/** Chord symbols in order; [] means the previous bar's harmony holds; ["N.C."] is silence. */
	chords: string[];
	/** The tempo in force, bpm of the meter's beat. */
	bpm: number;
	/** The time signature in force, e.g. "4/4". */
	meter: string;
	/** The key in force, e.g. "D major"; null when the chart marks none. */
	key: string | null;
	/** A section that begins at this bar: a heading, a rehearsal mark or a section's name in words; null otherwise. */
	section: string | null;
}
export interface ChartBars {
	bars: ChartBar[];
	warnings: string[];
}

/** A slot that keeps whatever was sounding: `/`, `?` read as `/`, or a group led by one. */
const HOLD = Symbol("hold");
type Read = string | typeof HOLD;

interface Notes {
	/** The adapter's own warnings, deduplicated (a replayed bar would repeat them). */
	warnings: Set<string>;
	grouped: boolean;
}

function keyText(key: Key | null): string | null {
	return key ? `${key.tonic} ${key.mode}` : null;
}

function readSimple(slot: SimpleSlot, line: number, notes: Notes): Read {
	switch (slot.kind) {
		case "chord":
			return slot.chord.canonical;
		case "nc":
		case "silence":
			return "N.C.";
		case "unknown":
			notes.warnings.add(`Line ${line}: unknown harmony \`?\` read as a hold`);
			return HOLD;
		default:
			return HOLD;
	}
}

function readSlot(slot: Slot, line: number, notes: Notes): Read {
	if (slot.kind !== "group") return readSimple(slot, line, notes);
	notes.grouped = true;
	const first = slot.members[0];
	return first ? readSimple(first, line, notes) : HOLD;
}

/**
 * One bar's symbols under the app's convention (they divide the bar
 * equally; [] holds the previous bar's harmony): a hold repeats the symbol
 * before it, a leading hold the harmony carried in from the bars before,
 * and with nothing before it is dropped with a warning.
 */
function barChords(bar: PlayedBar, carried: string | null, notes: Notes): string[] {
	const reads = bar.slots.map((s) => readSlot(s, bar.line, notes));
	if (reads.every((r) => r === HOLD)) return [];
	const chords: string[] = [];
	let current = carried;
	for (const read of reads) {
		if (read !== HOLD) current = read;
		if (current !== null) chords.push(current);
		else notes.warnings.add(`Line ${bar.line}: a hold with no harmony before it was left out`);
	}
	return chords;
}

/** The play-order bar each section heading begins at, the heading's name. */
function headingsAt(parse: ChartParse): Map<number, string> {
	const at = new Map<number, string>();
	for (const s of parse.sections) {
		if (s.firstBar !== null && !at.has(s.firstBar)) at.set(s.firstBar, s.name);
	}
	return at;
}

/** A bar's rehearsal mark, else the first of its words that names a section (a score's read marks sections so). */
function markedSection(bar: PlayedBar): string | null {
	if (bar.rehearsal) return bar.rehearsal;
	return bar.words?.map((w) => chartSectionName(w.text)).find(Boolean) ?? null;
}

/**
 * A barmark chart (the band's chord chart, docs/barmark-adoption-plan.md
 * Scope 1, and a score's read, `readChartWithAi`) as the bars it plays
 * (`ChartBar`, each under its written number), for chart alignment. barmark expands
 * repeats, replays and simile and leaves fermatas out; this maps each
 * played bar's slots to symbols that divide the bar equally (holds repeat
 * the symbol before them, `N.C.` and `--` are "N.C.", `?` holds, a group
 * plays its first member), the tempo in force (else `defaults.tempo`),
 * the meter (the song's own, `defaults.meter`, when the chart sets none:
 * barmark assumes 4/4 and a 3/4 song's chart would be read wrong), the
 * key and the section a bar begins (its heading, else its rehearsal mark,
 * else the first of its words that names one, `chartSectionName`). Every barmark diagnostic is a warning line, then the adapter's
 * own. Null when no bar plays or the first bar has no tempo.
 */
export function barmarkChartBars(
	markdown: string,
	defaults: { tempo: number | null; meter: string | null },
): ChartBars | null {
	const parse = parseChart(markdown);
	const first = parse.bars[0];
	let bpm = first?.tempo ?? defaults.tempo;
	if (!first || bpm === null) return null;
	const sectionAt = headingsAt(parse);
	// Without a `time:` line barmark reads 4/4; a one-bar `[n/d]` keeps its own meter either way.
	const chartSetsTime = parse.lines.some((l) => l.kind === "directive" && l.set.time);
	const meterOf = (m: { n: number; d: number }) =>
		!chartSetsTime && defaults.meter && m.n === 4 && m.d === 4 ? defaults.meter : `${m.n}/${m.d}`;
	const notes: Notes = { warnings: new Set(), grouped: false };
	const bars: ChartBar[] = [];
	let carried: string | null = null;
	for (const bar of parse.bars) {
		bpm = bar.tempo ?? defaults.tempo ?? bpm;
		const chords = barChords(bar, carried, notes);
		carried = chords.at(-1) ?? carried;
		bars.push({
			measure: bar.written,
			chords,
			bpm,
			meter: meterOf(bar.meter),
			key: keyText(bar.key),
			section: sectionAt.get(bar.index) ?? markedSection(bar),
		});
	}
	const own = [...notes.warnings];
	if (notes.grouped) own.push("Groups (`_`) are read by their first member");
	return { bars, warnings: [...parse.diagnostics.map(chartDiagnosticText), ...own] };
}
