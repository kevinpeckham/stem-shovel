import { parseChart } from "barmark";
import type { ChartDiagnostic, Key, PlayedBar, SimpleSlot, Slot } from "barmark";
import type { ChartBar, ChartBars } from "./chartBars.js";

/** A slot that keeps whatever was sounding: `/`, `?` read as `/`, or a group led by one. */
const HOLD = Symbol("hold");
type Read = string | typeof HOLD;

interface Notes {
	/** The adapter's own warnings, deduplicated (a replayed bar would repeat them). */
	warnings: Set<string>;
	grouped: boolean;
}

function diagnosticText(d: ChartDiagnostic): string {
	const base = `Line ${d.line}: ${d.message} (${d.token})`;
	return d.suggestion ? `${base} → ${d.suggestion}` : base;
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

/**
 * A barmark chart (the band's chord chart, docs/barmark-adoption-plan.md
 * Scope 1) as the bars it plays, in the shape `chartBars` gives
 * (`ChartBar`), so chart alignment reads it unchanged. barmark expands
 * repeats, replays and simile and leaves fermatas out; this maps each
 * played bar's slots to symbols that divide the bar equally (holds repeat
 * the symbol before them, `N.C.` and `--` are "N.C.", `?` holds, a group
 * plays its first member), the tempo in force (else `defaults.tempo`),
 * the meter (the song's own, `defaults.meter`, when the chart sets none:
 * barmark assumes 4/4 and a 3/4 song's chart would be read wrong), the
 * key and the section a bar begins. Every barmark diagnostic is a warning line, then the adapter's
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
	const sectionAt = new Map<number, string>();
	for (const s of parse.sections) {
		if (s.firstBar !== null && !sectionAt.has(s.firstBar)) sectionAt.set(s.firstBar, s.name);
	}
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
			measure: bar.index,
			chords,
			bpm,
			meter: meterOf(bar.meter),
			key: keyText(bar.key),
			section: sectionAt.get(bar.index) ?? null,
		});
	}
	const own = [...notes.warnings];
	if (notes.grouped) own.push("Groups (`_`) are read by their first member");
	return { bars, warnings: [...parse.diagnostics.map(diagnosticText), ...own] };
}
