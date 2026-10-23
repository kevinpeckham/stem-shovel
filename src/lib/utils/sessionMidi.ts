import { beatsBetween } from "#lib/audio/measures.js";
import type { StudioClip, StudioArrangement } from "#lib/val/StudioSchema.js";
import { clipLaneEvents } from "./clipLaneEvents";
import { clipNoteEvents } from "./clipNoteEvents";
import { keySignatureOf } from "./keySignatureOf";
import {
	midiLaneEvent,
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
import { tempoStepsOf } from "./tempoStepsOf";

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
	// A MIDI file's tempo is steps: a ramp goes out as the tempo at every beat line inside it (utils/tempoStepsOf.ts),
	// and the ticks go through that stepped map, so each event lands at its second once a DAW applies the file's tempos.
	const tempos = tempoStepsOf(grid, a.tempoChanges ?? []);
	const fileGrid = studioGrid({ bpm: a.bpm, beatsPerBar: a.beatsPerBar, tempoChanges: tempos });
	const tick = (seconds: number) => Math.round(beatsBetween(fileGrid, 0, seconds) * SESSION_PPQ);
	const songEnd = a.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
	const conductor = conductorOf(a, title, tempos, tick);
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
		const { events, end } = trackEventsOf(t.name, clips, channel, tick);
		tracks.push({ events, endTick: end });
	}
	return midiFileTracks(tracks, SESSION_PPQ);
}

/** The conductor track: the name, the tempo steps, the meters, the keys and the markers, each at its tick. */
function conductorOf(
	a: StudioArrangement,
	title: string,
	tempos: { start: number; bpm: number }[],
	tick: (seconds: number) => number,
): MidiEvent[] {
	const conductor: MidiEvent[] = [midiTrackName(0, title), midiTempo(0, a.bpm)];
	for (const t of tempos) conductor.push(midiTempo(tick(t.start), t.bpm));
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
	return conductor;
}

/** A MIDI track's events: its name, then each clip's notes and expression lanes on `channel`, with the last tick. */
function trackEventsOf(
	name: string,
	clips: StudioClip[],
	channel: number,
	tick: (seconds: number) => number,
): { events: MidiEvent[]; end: number } {
	const events: MidiEvent[] = [midiTrackName(0, name)];
	let end = 0;
	for (const c of clips) {
		for (const n of clipNoteEvents(c)) {
			const on = tick(n.at);
			const off = Math.max(on + 1, tick(n.at + n.duration));
			events.push(midiNoteOn(on, channel, n.pitch, Math.round(n.velocity * 127)));
			events.push(midiNoteOff(off, channel, n.pitch));
			end = Math.max(end, off);
		}
		// The expression lanes as the controller, bend and pressure events they are.
		for (const e of clipLaneEvents(c)) {
			const at = tick(e.at);
			events.push(midiLaneEvent(at, channel, e));
			end = Math.max(end, at);
		}
	}
	return { events, end };
}
