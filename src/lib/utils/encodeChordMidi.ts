import type { ProgressionEntry } from "./chordRhythm";
import { humanizeOffsets } from "./humanizeOffsets";
import {
	MIDI_PPQ,
	midiFile,
	midiNoteOff,
	midiNoteOn,
	midiProgram,
	midiTempo,
	midiTimeSignature,
} from "./midiFile";

/**
 * A progression as a Standard MIDI File (docs/chord-player.md, "The
 * progression pad"): the tempo and time signature, then each chord's
 * notes held for its beats on channel 1 as an acoustic grand (program 0),
 * a rest a gap. A chord lets go a sixteenth before the next starts, so a
 * DAW hears separate chords rather than one tied smear. With
 * `opts.humanize` (0..1) each chord lands a little early or late and a
 * little louder or softer, all its notes together as a hand plays them, by
 * the Studio's amounts (`humanizeOffsets`, from `opts.random`).
 */
export function encodeChordMidi(
	entries: ProgressionEntry[],
	bpm: number,
	beatsPerBar: number,
	velocity = 90,
	opts: { humanize?: number; random?: () => number } = {},
): Blob {
	const humanize = opts.humanize ?? 0;
	const events = [
		midiTempo(0, bpm),
		midiTimeSignature(0, beatsPerBar, 2, 24),
		midiProgram(0, 0, 0),
	];
	let tick = 0;
	for (const e of entries) {
		const length = e.beats * MIDI_PPQ;
		if (e.kind === "chord") {
			let on = tick;
			let off = tick + length - MIDI_PPQ / 4;
			let hit = velocity;
			if (humanize > 0) {
				const scatter = humanizeOffsets(humanize, opts.random);
				const shift = Math.round((scatter.seconds * MIDI_PPQ * bpm) / 60);
				on = Math.max(0, tick + shift);
				off += shift;
				hit = Math.max(1, Math.min(127, Math.round(velocity * (1 + scatter.velocity))));
			}
			for (const note of e.notes) {
				events.push(midiNoteOn(on, 0, note, hit));
				events.push(midiNoteOff(Math.max(on + 1, off), 0, note));
			}
		}
		tick += length;
	}
	return midiFile(events, MIDI_PPQ, tick);
}
