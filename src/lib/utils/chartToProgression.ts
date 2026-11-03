import {
	beatsOf,
	parseChart,
	type ChartParse,
	type Feel,
	type PlayedBar,
	type SimpleSlot,
} from "barmark";
import type { ChordRecord } from "barmark";
import { CIRCLE_OF_FIFTHS, type ChordVoicing } from "#lib/constants/circleOfFifths.js";
import type { ChordBeats, ProgressionEntry } from "#lib/utils/chordRhythm.js";
import { noteMidi, voiceChord } from "#lib/utils/chordNotes.js";
import { displayChord } from "#lib/utils/displayChord.js";
import { intervalSemitones } from "#lib/utils/intervalSemitones.js";
import { swingOfPercent } from "#lib/utils/swingOfPercent.js";
import { tonicPitchClass } from "#lib/utils/tonicPitchClass.js";
import type { ProgressionData } from "#lib/val/ProgressionSchema.js";

export interface ChartImport {
	data: ProgressionData;
	/** The chart's title, else its first section, else "Imported chart". */
	name: string;
	feel: Feel;
	/** The first bar's swing on the app's scale (0 straight to 1 a triplet feel): its `swing N%` through `swingOfPercent`, 1 for bare swing or shuffle, 0 for straight. */
	swing: number;
	/** The chart wrote a `feel:` directive (absent, the player's swing stays as it is). */
	hasFeel: boolean;
	/** What the pad could not carry exactly, each once, and the parse's warnings ("line N: …"). */
	warnings: string[];
	/** The parse's errors ("line N: …"), or that there are no bars: the caller refuses the chart. */
	errors: string[];
}

const MAX_ENTRIES = 400;
const DEFAULT_BPM = 100;
/** How far a mode's tonic sits above its parent major's, to find the circle position. */
const MODE_TO_MAJOR: Record<string, number> = {
	major: 0,
	ionian: 0,
	minor: 3,
	aeolian: 3,
	dorian: -2,
	phrygian: -4,
	lydian: -5,
	mixolydian: 5,
	locrian: 1,
};

/** One sounding stretch of the chart on a beat timeline (fractional until quantized). */
interface Span {
	chord: ChordRecord | null;
	start: number;
	end: number;
}

/**
 * A barmark chord chart onto the progression pad (docs/chord-player.md,
 * the inverse of `progressionChart`): the first bar's meter, tempo, key
 * and feel set the player; each slot divides its bar equally (a group its
 * slot), a hold extends what came before (a rest stays a rest), and each
 * chord's span is quantized to whole beats on the running timeline (an
 * end rounded to the nearest beat, never shorter than one) and struck as
 * entries of 4, 2 and 1 beats. N.C., silence, unreadable slots and note
 * sets are rests. Voiced by the player's voicing and octave, a slash bass
 * an octave below; a swing amount sets the player's swing (past 66.7%,
 * the triplet feel, it is clamped there with a warning). Never throws: errors say why the caller should refuse.
 */
export function chartToProgression(
	text: string,
	opts: { voicing: ChordVoicing; octave: number; bpm?: number },
): ChartImport {
	const chart = parseChart(text);
	const warnings = new Set<string>(diagnostics(chart, "warning"));
	const errors = diagnostics(chart, "error");
	const bars = chart.bars;
	if (bars.length === 0) errors.push("the chart has no bars");
	const first = bars[0];
	const entries = first ? barsToEntries(bars, opts, warnings) : [];
	if (first) noteChanges(bars, warnings);
	const tempo = first?.tempo ?? opts.bpm ?? DEFAULT_BPM;
	const key = first?.key ? keyIndex(first.key) : undefined;
	return {
		data: {
			bpm: Math.max(30, Math.min(300, Math.round(tempo))),
			beatsPerBar: Math.max(2, Math.min(6, Math.round(first ? beatsOf(first.meter) : 4))),
			entries,
			...(key === undefined ? {} : { key }),
		},
		name: chart.title?.trim() || chart.sections[0]?.name.trim() || "Imported chart",
		feel: first?.feel ?? "straight",
		swing: first ? swingOf(first, warnings) : 0,
		hasFeel: chart.lines.some((l) => l.kind === "directive" && l.set.feel !== undefined),
		warnings: [...warnings],
		errors,
	};
}

function diagnostics(chart: ChartParse, severity: "error" | "warning"): string[] {
	return chart.diagnostics
		.filter((d) => d.severity === severity)
		.map((d) => `line ${d.line}: ${d.message}`);
}

/** The circle position of a key's parent major, undefined for a tonic that is not a note. */
function keyIndex(key: { tonic: string; mode: string }): number | undefined {
	const tonic = tonicPitchClass(key.tonic);
	if (tonic === null) return undefined;
	const pitch = (tonic + (MODE_TO_MAJOR[key.mode] ?? 0) + 12) % 12;
	return CIRCLE_OF_FIFTHS.find((p) => p.major.pitch === pitch)?.index;
}

/** A bar's feel as the app's swing amount, read from barmark's `swingPercent` (bare swing or shuffle is the triplet feel). */
function swingOf(bar: PlayedBar, warnings: Set<string>): number {
	if (bar.feel === "straight") return 0;
	const percent = bar.swingPercent;
	if (percent === undefined) return 1;
	if (percent > 66.7)
		warnings.add(
			`the chart's swing of ${percent}% is past the player's range; set to the triplet feel`,
		);
	return swingOfPercent(percent);
}

const meterOf = (bar: PlayedBar) => `${bar.meter.n}/${bar.meter.d}`;
const keyOf = (bar: PlayedBar) => (bar.key ? `${bar.key.tonic} ${bar.key.mode}` : "");

/** The pad has one meter, tempo and key: a chart that changes them is played in the first bar's. */
function noteChanges(bars: PlayedBar[], warnings: Set<string>) {
	const [first] = bars;
	if (bars.some((b) => meterOf(b) !== meterOf(first)))
		warnings.add("the meter changes; the pad keeps the first bar's");
	if (bars.some((b) => b.tempo !== first.tempo))
		warnings.add("the tempo changes; the pad keeps the first");
	if (bars.some((b) => keyOf(b) !== keyOf(first)))
		warnings.add("the key changes; the circle stays in the first");
}

function barsToEntries(
	bars: PlayedBar[],
	opts: { voicing: ChordVoicing; octave: number },
	warnings: Set<string>,
): ProgressionEntry[] {
	const entries: ProgressionEntry[] = [];
	let at = 0;
	for (const span of timeline(bars, warnings)) {
		const end = Math.max(at + 1, Math.round(span.end));
		if (!Number.isInteger(span.start) || !Number.isInteger(span.end))
			warnings.add("some chords were not on the beat and were rounded");
		const beats = strikes(end - at);
		if (span.chord && beats.length > 1)
			warnings.add("a chord longer than 4 beats or of 3 beats is struck again");
		for (const b of beats) {
			if (entries.length >= MAX_ENTRIES) {
				warnings.add(`the pad holds ${MAX_ENTRIES} chords and rests; the rest was left off`);
				return entries;
			}
			entries.push(span.chord ? chordEntry(span.chord, b, opts) : { kind: "rest", beats: b });
		}
		at = end;
	}
	return entries;
}

/** A length in whole beats as the pad's 4, 2 and 1. */
function strikes(beats: number): ChordBeats[] {
	const out: ChordBeats[] = [];
	let left = beats;
	for (const size of [4, 2, 1] as const) for (; left >= size; left -= size) out.push(size);
	return out;
}

/** The bars' slots as spans on one beat timeline: a hold, across a bar line too, extends the span before it. */
function timeline(bars: PlayedBar[], warnings: Set<string>): Span[] {
	const spans: Span[] = [];
	let at = 0;
	const place = (slot: SimpleSlot, length: number) => {
		const last = spans.at(-1);
		if (slot.kind === "hold" && last) last.end = at + length;
		else spans.push({ chord: slotChord(slot, warnings), start: at, end: at + length });
		at += length;
	};
	for (const bar of bars) {
		const length = beatsOf(bar.meter) / Math.max(1, bar.slots.length);
		for (const slot of bar.slots) {
			if (slot.kind !== "group") place(slot, length);
			else for (const member of slot.members) place(member, length / slot.members.length);
		}
	}
	return spans;
}

/** The chord a slot strikes, or null for a rest (with a warning for what the pad cannot play). */
function slotChord(slot: SimpleSlot, warnings: Set<string>): ChordRecord | null {
	if (slot.kind === "unknown") warnings.add("a chord the chart could not read is a rest");
	if (slot.kind !== "chord") return null;
	if (slot.chord.kind === "notes" || slot.chord.root === null) {
		warnings.add(`${slot.chord.canonical} is a note set: the pad rests there`);
		return null;
	}
	return slot.chord;
}

function chordEntry(
	chord: ChordRecord,
	beats: ChordBeats,
	opts: { voicing: ChordVoicing; octave: number },
): ProgressionEntry {
	const root = tonicPitchClass(chord.root ?? "") ?? 0;
	const bass = tonicPitchClass(chord.bass);
	const semitones = chord.intervals.map(intervalSemitones);
	const intervals = [0, ...semitones.filter((s) => s !== 0)];
	let notes = voiceChord({ pitch: root, intervals, voicing: opts.voicing, octave: opts.octave });
	if (bass !== null && bass !== root)
		notes = [noteMidi(bass, opts.octave - 1), ...notes.slice(0, 11)];
	return {
		kind: "chord",
		label: displayChord(chord.canonical).slice(0, 16),
		wedge: wedgeOf(root, semitones),
		notes,
		beats,
	};
}

/** The wedge the chord lights: its root's position on the ring its quality draws (a flat fifth over a flat third is diminished). */
function wedgeOf(root: number, semitones: number[]): string {
	const ring = semitones.includes(3) ? (semitones.includes(6) ? "diminished" : "minor") : "major";
	return CIRCLE_OF_FIFTHS.find((p) => p[ring].pitch === root)?.[ring].id ?? "";
}
