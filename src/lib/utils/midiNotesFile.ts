import type { MidiSummary } from "../audio/midi";
import type { StudioNote } from "../val/StudioSchema";
import {
	MIDI_PPQ,
	midiFile,
	midiNoteOff,
	midiNoteOn,
	midiTempo,
	midiTimeSignature,
	type MidiEvent,
} from "./midiFile";

/** General MIDI's percussion channel (the tenth), where a drums track's notes go. */
export const DRUM_CHANNEL = 9;

/**
 * A MIDI clip's notes as a Standard MIDI File (docs/multitrack-recorder.md,
 * phase 3: Export MIDI): the song's tempo and meter first, so a DAW lays
 * the notes on its grid as the Studio had them, then every note on channel
 * 1 (channel 10 for drums). Ticks from seconds at the tempo given.
 */
export function notesToMidiBlob(
	notes: StudioNote[],
	song: { bpm: number; beatsPerBar: number; drums?: boolean },
): Blob {
	const channel = song.drums ? DRUM_CHANNEL : 0;
	const tick = (seconds: number) => Math.round((seconds * song.bpm * MIDI_PPQ) / 60);
	const events: MidiEvent[] = [
		midiTempo(0, song.bpm),
		midiTimeSignature(0, song.beatsPerBar, 2, 24),
	];
	let end = 0;
	for (const n of notes) {
		const on = tick(n.t);
		const off = Math.max(on + 1, tick(n.t + n.d));
		events.push(midiNoteOn(on, channel, n.p, Math.round(n.v * 127)));
		events.push(midiNoteOff(off, channel, n.p));
		end = Math.max(end, off);
	}
	return midiFile(events, MIDI_PPQ, end);
}

/** A parsed MIDI file's notes (seconds already, every track merged) as a clip's notes. */
export function notesFromMidiSummary(summary: MidiSummary): StudioNote[] {
	return summary.notes
		.map((n) => ({
			t: round4(Math.max(0, n.start)),
			d: round4(Math.max(0.001, n.duration)),
			p: Math.max(0, Math.min(127, Math.round(n.pitch))),
			v: Math.max(0, Math.min(1, n.velocity > 1 ? n.velocity / 127 : n.velocity)),
		}))
		.sort((a, b) => a.t - b.t || a.p - b.p);
}

const round4 = (x: number) => Math.round(x * 10000) / 10000;
