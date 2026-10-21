/**
 * A Standard MIDI File: format 0 (`midiFile`, one track of timed events)
 * or format 1 (`midiFileTracks`, a conductor track and one per part). The
 * drum machine's export and the chord player's progression share the
 * first; the session bundle (utils/sessionMidi.ts) writes the second.
 * Each lays out its own events (a tempo and time signature first, then
 * notes) and this writes the bytes. Ticks are absolute; events may
 * arrive unsorted.
 */
export interface MidiEvent {
	tick: number;
	bytes: number[];
}

export const MIDI_PPQ = 96;

/** The tempo meta event: microseconds per quarter note. */
export function midiTempo(tick: number, bpm: number): MidiEvent {
	const us = Math.round(60_000_000 / bpm);
	return { tick, bytes: [0xff, 0x51, 0x03, (us >> 16) & 0xff, (us >> 8) & 0xff, us & 0xff] };
}

/** The time signature meta event: `numerator` over 2^`denominatorPower`, `clocksPerClick` MIDI clocks a metronome click. */
export function midiTimeSignature(
	tick: number,
	numerator: number,
	denominatorPower: number,
	clocksPerClick: number,
): MidiEvent {
	return { tick, bytes: [0xff, 0x58, 0x04, numerator, denominatorPower, clocksPerClick, 8] };
}

export function midiNoteOn(
	tick: number,
	channel: number,
	note: number,
	velocity: number,
): MidiEvent {
	return {
		tick,
		bytes: [0x90 | (channel & 0x0f), note & 0x7f, Math.max(1, Math.min(127, velocity))],
	};
}
export function midiNoteOff(tick: number, channel: number, note: number): MidiEvent {
	return { tick, bytes: [0x80 | (channel & 0x0f), note & 0x7f, 0] };
}
/** A program change (an instrument), for a chord track a DAW should voice as a piano. */
export function midiProgram(tick: number, channel: number, program: number): MidiEvent {
	return { tick, bytes: [0xc0 | (channel & 0x0f), program & 0x7f] };
}

/** A text meta event (`type` 0x01 text, 0x03 track name, 0x06 marker), UTF-8. */
function midiText(tick: number, type: number, text: string): MidiEvent {
	const bytes = Array.from(new TextEncoder().encode(text)).slice(0, 127);
	return { tick, bytes: [0xff, type, bytes.length, ...bytes] };
}
/** The track's name (a DAW names the part after it). */
export const midiTrackName = (tick: number, name: string) => midiText(tick, 0x03, name);
/** A marker on the conductor track: Logic, Pro Tools, Cubase, Reaper and Ardour show it on the ruler. */
export const midiMarker = (tick: number, name: string) => midiText(tick, 0x06, name);
/** The key signature meta event: `sharps` −7..7 (negative for flats), major or minor. */
export function midiKeySignature(tick: number, sharps: number, minor: boolean): MidiEvent {
	const sf = Math.max(-7, Math.min(7, Math.round(sharps)));
	return { tick, bytes: [0xff, 0x59, 0x02, sf & 0xff, minor ? 1 : 0] };
}

/** The file: the events sorted by tick, note-offs before note-ons at the same tick, an end-of-track at `endTick` (or after the last event). */
export function midiFile(events: MidiEvent[], ppq = MIDI_PPQ, endTick?: number): Blob {
	const track = encodeTrack(events, endTick);
	const header = [...ascii("MThd"), ...u32(6), ...u16(0), ...u16(1), ...u16(ppq)];
	return new Blob([Uint8Array.from([...header, ...track])], { type: "audio/midi" });
}

/** A format 1 file: the first track is the conductor (tempo, meter, key, markers), the rest the parts; each ends at `endTick` or after its last event. */
export function midiFileTracks(
	tracks: { events: MidiEvent[]; endTick?: number }[],
	ppq = MIDI_PPQ,
): Blob {
	const header = [...ascii("MThd"), ...u32(6), ...u16(1), ...u16(tracks.length), ...u16(ppq)];
	const body = tracks.flatMap((t) => encodeTrack(t.events, t.endTick));
	return new Blob([Uint8Array.from([...header, ...body])], { type: "audio/midi" });
}

/** One MTrk chunk: the events in order as delta times, then the end-of-track. */
function encodeTrack(events: MidiEvent[], endTick?: number): number[] {
	const sorted = [...events].sort((a, b) => a.tick - b.tick || rank(a) - rank(b));
	const lastTick = sorted.length ? sorted[sorted.length - 1].tick : 0;
	sorted.push({ tick: Math.max(lastTick, endTick ?? lastTick), bytes: [0xff, 0x2f, 0x00] });
	const track: number[] = [];
	let last = 0;
	for (const e of sorted) {
		track.push(...variableLength(e.tick - last), ...e.bytes);
		last = e.tick;
	}
	return [...ascii("MTrk"), ...u32(track.length), ...track];
}

/** Meta events first, then note-offs, then everything else, when ticks tie. */
function rank(e: MidiEvent): number {
	const status = e.bytes[0] & 0xf0;
	if (e.bytes[0] === 0xff) return 0;
	if (status === 0x80) return 1;
	return 2;
}

function variableLength(n: number): number[] {
	const out = [n & 0x7f];
	let rest = n >> 7;
	while (rest > 0) {
		out.unshift((rest & 0x7f) | 0x80);
		rest >>= 7;
	}
	return out;
}
const ascii = (s: string) => s.split("").map((c) => c.charCodeAt(0));
const u16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const u32 = (n: number) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
