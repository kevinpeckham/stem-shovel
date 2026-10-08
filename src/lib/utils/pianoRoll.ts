import { DRUM_GM_NOTES, DRUM_VOICES } from "../constants/drumMachine";
import type { StudioNote } from "../val/StudioSchema";
import { spellNote } from "./noteSpelling";

/**
 * The piano-roll editor's arithmetic (docs/multitrack-recorder.md, phase
 * 3b), kept pure: which pitch rows to show, what to call them, and a clip's
 * notes after an edit of the selected ones. Rows run from the highest
 * pitch at the top to the lowest at the bottom, as a piano roll does.
 */
export interface RollRow {
	pitch: number;
	label: string;
	/** A black key on a piano (unlabelled, shaded); never for drums. */
	black: boolean;
}

const BLACK = new Set([1, 3, 6, 8, 10]);
/** The drum voices in the order the pads have them, each on its General MIDI note. */
const DRUM_ROWS = DRUM_VOICES.map((v) => ({
	pitch: DRUM_GM_NOTES[v.id],
	label: v.label,
}));

/** What a note is called: its letter and octave (C4 is middle C), or the drum voice on that note. */
export function rollNoteLabel(pitch: number, drums: boolean): string {
	if (drums) {
		const row = DRUM_ROWS.find((r) => r.pitch === pitch);
		if (row) return row.label;
	}
	const s = spellNote(pitch, false);
	return `${s.name}${s.octave}`;
}

/**
 * The rows a clip's roll shows: for drums, the kit's voices (and any other
 * note the clip holds); for a keyboard, whole octaves spanning the notes
 * with at least two octaves around middle C when there are few, so there
 * is room to draw above and below.
 */
export function rollRows(notes: StudioNote[], drums: boolean): RollRow[] {
	if (drums) {
		const pitches = new Set(DRUM_ROWS.map((r) => r.pitch));
		for (const n of notes) pitches.add(n.p);
		return Array.from(pitches)
			.sort((a, b) => b - a)
			.map((pitch) => ({ pitch, label: rollNoteLabel(pitch, true), black: false }));
	}
	let lo = 60;
	let hi = 83;
	for (const n of notes) {
		if (n.p < lo) lo = n.p;
		if (n.p > hi) hi = n.p;
	}
	// Whole octaves: down to a C below the lowest note's octave, up to the B above the highest's.
	lo = Math.max(0, Math.floor(lo / 12) * 12 - 12);
	hi = Math.min(127, Math.ceil((hi + 1) / 12) * 12 + 11);
	const rows: RollRow[] = [];
	for (let p = hi; p >= lo; p--)
		rows.push({ pitch: p, label: rollNoteLabel(p, false), black: BLACK.has(p % 12) });
	return rows;
}

export type RollEdit =
	| { kind: "move"; dt: number; dp: number }
	| { kind: "resize"; dd: number }
	| { kind: "velocity"; v: number }
	| { kind: "delete" };

/**
 * A clip's notes after an edit of those at `selected` (indices into
 * `notes`): moved by `dt` seconds (never before zero) and `dp` semitones
 * (within 0..127), lengthened by `dd` (never under `minLength`), set to a
 * velocity, or removed. Other notes are untouched; the order is kept so
 * the indices stay valid until the caller sorts for the arrangement.
 */
export function editNotes(
	notes: StudioNote[],
	selected: Iterable<number>,
	edit: RollEdit,
	minLength = 0.05,
): StudioNote[] {
	const which = new Set(selected);
	if (edit.kind === "delete") return notes.filter((_, i) => !which.has(i));
	return notes.map((n, i) => {
		if (!which.has(i)) return n;
		switch (edit.kind) {
			case "move":
				return {
					...n,
					t: round4(Math.max(0, n.t + edit.dt)),
					p: Math.max(0, Math.min(127, Math.round(n.p + edit.dp))),
				};
			case "resize":
				return { ...n, d: round4(Math.max(minLength, n.d + edit.dd)) };
			case "velocity":
				return { ...n, v: Math.max(0, Math.min(1, edit.v)) };
		}
	});
}

/** A time on the roll's grid: the nearest multiple of `step` seconds (the time itself for no step), never before zero. */
export function snapRollTime(seconds: number, step: number): number {
	if (step <= 0) return Math.max(0, seconds);
	return Math.max(0, Math.round(seconds / step) * step);
}

const round4 = (x: number) => Math.round(x * 10000) / 10000;
