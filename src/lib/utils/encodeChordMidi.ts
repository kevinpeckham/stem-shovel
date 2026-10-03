import type { ProgressionEntry } from "./chordRhythm";
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
 * DAW hears separate chords rather than one tied smear.
 */
export function encodeChordMidi(
	entries: ProgressionEntry[],
	bpm: number,
	beatsPerBar: number,
	velocity = 90,
): Blob {
	const events = [
		midiTempo(0, bpm),
		midiTimeSignature(0, beatsPerBar, 2, 24),
		midiProgram(0, 0, 0),
	];
	let tick = 0;
	for (const e of entries) {
		const length = e.beats * MIDI_PPQ;
		if (e.kind === "chord") {
			const off = tick + length - MIDI_PPQ / 4;
			for (const note of e.notes) {
				events.push(midiNoteOn(tick, 0, note, velocity));
				events.push(midiNoteOff(Math.max(tick + 1, off), 0, note));
			}
		}
		tick += length;
	}
	return midiFile(events, MIDI_PPQ, tick);
}
