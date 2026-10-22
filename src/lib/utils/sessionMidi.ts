import { beatsBetween } from "#lib/audio/measures.js";
import type { StudioArrangement } from "#lib/val/StudioSchema.js";
import { clipNoteEvents } from "./clipNoteEvents";
import { keySignatureOf } from "./keySignatureOf";
import {
	midiFileTracks,
	midiKeySignature,
	midiMarker,
	midiNoteOff,
	midiNoteOn,
	midiTempo,
	midiTimeSignature,
	midiTrackName,
	type MidiEvent,
} from "./midiFile";
import { DRUM_CHANNEL } from "./midiNotesFile";
import { studioGrid } from "./studioGrid";

/** Ticks a quarter note: fine enough that a note at any second lands within a tenth of a millisecond at 300 bpm. */
const SESSION_PPQ = 480;

/**
 * The session bundle's MIDI file (docs/daw-interop-plan.md): a format 1
 * Standard MIDI File whose conductor track carries what the audio files
 * cannot, the tempo map, the meters, the key and its changes, and the
 * markers, and whose other tracks are the MIDI tracks' clips as notes
 * (channel 10 for a drums track). Logic, Pro Tools, Cubase, Reaper and
 * Ardour read the conductor into the project; the parts land as MIDI
 * regions. Ticks come from the arrangement's own tempo map, so a note or
 * a marker at a second stays at that second once the DAW applies the
 * tempos. Pure; the bundle names the file after the song.
 */
export function sessionMidi(a: StudioArrangement, title: string): Blob {
	const grid = studioGrid(a);
	const tick = (seconds: number) => Math.round(beatsBetween(grid, 0, seconds) * SESSION_PPQ);
	const songEnd = a.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
	const conductor: MidiEvent[] = [midiTrackName(0, title), midiTempo(0, a.bpm)];
	for (const c of a.tempoChanges ?? [])
		if (c.start > 0) conductor.push(midiTempo(tick(c.start), c.bpm));
	conductor.push(midiTimeSignature(0, a.beatsPerBar, 2, 24));
	for (const c of a.meterChanges ?? [])
		if (c.start > 0) conductor.push(midiTimeSignature(tick(c.start), c.beatsPerBar, 2, 24));
	const keys = [{ start: 0, key: a.key ?? "" }, ...(a.keyChanges ?? []).filter((c) => c.start > 0)];
	for (const k of keys) {
		const sig = keySignatureOf(k.key);
		if (sig) conductor.push(midiKeySignature(tick(k.start), sig.sharps, sig.minor));
	}
	for (const m of [...(a.markers ?? [])].sort((x, y) => x.t - y.t))
		conductor.push(midiMarker(tick(m.t), m.name));
	const tracks: { events: MidiEvent[]; endTick?: number }[] = [
		{ events: conductor, endTick: tick(songEnd) },
	];
	let nextChannel = 0;
	for (const t of a.tracks) {
		if (t.kind !== "midi") continue;
		const clips = a.clips.filter((c) => c.trackId === t.id && c.notes?.length && !c.muted);
		if (!clips.length) continue;
		let channel: number;
		if (t.input?.source === "drums") channel = DRUM_CHANNEL;
		else {
			if (nextChannel === DRUM_CHANNEL) nextChannel++;
			channel = nextChannel % 16;
			nextChannel++;
		}
		const events: MidiEvent[] = [midiTrackName(0, t.name)];
		let end = 0;
		for (const c of clips)
			for (const n of clipNoteEvents(c)) {
				const on = tick(n.at);
				const off = Math.max(on + 1, tick(n.at + n.duration));
				events.push(midiNoteOn(on, channel, n.pitch, Math.round(n.velocity * 127)));
				events.push(midiNoteOff(off, channel, n.pitch));
				end = Math.max(end, off);
			}
		tracks.push({ events, endTick: end });
	}
	return midiFileTracks(tracks, SESSION_PPQ);
}
