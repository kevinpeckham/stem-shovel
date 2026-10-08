import type { StudioNote } from "../val/StudioSchema";

/** A note on or off as an instrument reports it while a MIDI track records (docs/multitrack-recorder.md, phase 3). */
export interface NoteEvent {
	on: boolean;
	pitch: number;
	velocity: number;
	/** The context's clock when it happened. */
	time: number;
}

/**
 * The notes of a MIDI take from an instrument's note-on and note-off events:
 * each on starts a note at its time less `from` (the context time the pass
 * began on) less `shift` (a part played by hand against what is heard lands
 * late by the output latency); the matching off ends it; a note still down
 * at `end` ends there. An off with no on, and an on before the pass (a key
 * held down as it started) count from zero. Sorted by start, then pitch.
 */
export function pairNoteEvents(
	events: NoteEvent[],
	opts: { from: number; shift: number; end: number },
): StudioNote[] {
	const open = new Map<number, { t: number; v: number }>();
	const notes: StudioNote[] = [];
	const at = (time: number) => Math.max(0, time - opts.from - opts.shift);
	const close = (pitch: number, time: number) => {
		const o = open.get(pitch);
		if (!o) return;
		open.delete(pitch);
		const d = round4(Math.max(0.001, at(time) - o.t));
		notes.push({ t: round4(o.t), d, p: pitch, v: o.v });
	};
	for (const e of events.toSorted((a, b) => a.time - b.time)) {
		if (e.on) {
			// A restrike while the note is still down: the first ends where the second begins.
			close(e.pitch, e.time);
			open.set(e.pitch, { t: at(e.time), v: Math.max(0, Math.min(1, e.velocity)) });
		} else close(e.pitch, e.time);
	}
	for (const pitch of Array.from(open.keys())) close(pitch, opts.end);
	return notes.sort((a, b) => a.t - b.t || a.p - b.p);
}

const round4 = (x: number) => Math.round(x * 10000) / 10000;
