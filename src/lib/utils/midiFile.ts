/**
 * A Standard MIDI File, format 0: one track of timed events. The drum
 * machine's export and the chord player's progression share it; each lays
 * out its own events (a tempo and time signature first, then notes) and
 * this writes the bytes. Ticks are absolute; events may arrive unsorted.
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

/** The file: the events sorted by tick, note-offs before note-ons at the same tick, an end-of-track at `endTick` (or after the last event). */
export function midiFile(events: MidiEvent[], ppq = MIDI_PPQ, endTick?: number): Blob {
	const sorted = [...events].sort((a, b) => a.tick - b.tick || rank(a) - rank(b));
	const lastTick = sorted.length ? sorted[sorted.length - 1].tick : 0;
	sorted.push({ tick: Math.max(lastTick, endTick ?? lastTick), bytes: [0xff, 0x2f, 0x00] });
	const track: number[] = [];
	let last = 0;
	for (const e of sorted) {
		track.push(...variableLength(e.tick - last), ...e.bytes);
		last = e.tick;
	}
	const header = [
		...ascii("MThd"),
		...u32(6),
		...u16(0),
		...u16(1),
		...u16(ppq),
		...ascii("MTrk"),
		...u32(track.length),
	];
	return new Blob([Uint8Array.from([...header, ...track])], { type: "audio/midi" });
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
