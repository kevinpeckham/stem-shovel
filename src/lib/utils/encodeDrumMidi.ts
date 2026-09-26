import { DRUM_GM_NOTES } from "$lib/constants/drumMachine";
import type { DrumPattern } from "$lib/val/DrumPatternSchema";

/**
 * A pattern as a Standard MIDI File (format 0, one track, 96 ticks to the
 * quarter note): the tempo, then every hit as a General MIDI drum note on
 * channel 10, swing moving the off-sixteenths late as the player does.
 * Velocity follows the cell (ghost 50, normal 100, accent 127) and the
 * row's level scales it, so the mix survives the trip into a DAW. Muted
 * rows are left out. Notes last half a step; drums only need the onset.
 */
const PPQ = 96;
const STEP_TICKS = PPQ / 4;
const VELOCITY = [0, 50, 100, 127];

export function encodeDrumMidi(pattern: DrumPattern, bpm: number, swing: number): Blob {
	// Events as absolute ticks, sorted, then written with delta times.
	const events: { tick: number; bytes: number[] }[] = [];
	const push = (tick: number, ...bytes: number[]) => events.push({ tick, bytes });
	const usPerQuarter = Math.round(60_000_000 / bpm);
	push(
		0,
		0xff,
		0x51,
		0x03,
		(usPerQuarter >> 16) & 0xff,
		(usPerQuarter >> 8) & 0xff,
		usPerQuarter & 0xff,
	);
	push(0, 0xff, 0x58, 0x04, 4, 2, 24, 8); // 4/4
	for (const row of pattern.rows) {
		if (row.mute) continue;
		const note = DRUM_GM_NOTES[row.voice];
		row.cells.forEach((cell, step) => {
			if (!cell) return;
			const late = step % 2 === 1 ? Math.round((swing * STEP_TICKS) / 3) : 0;
			const tick = step * STEP_TICKS + late;
			const velocity = Math.max(1, Math.round((VELOCITY[cell] ?? 100) * (0.5 + row.level / 2)));
			push(tick, 0x99, note, velocity);
			push(tick + STEP_TICKS / 2, 0x89, note, 0);
		});
	}
	const end = pattern.steps * STEP_TICKS;
	push(end, 0xff, 0x2f, 0x00);
	events.sort((a, b) => a.tick - b.tick);

	const track: number[] = [];
	let last = 0;
	for (const e of events) {
		track.push(...variableLength(e.tick - last), ...e.bytes);
		last = e.tick;
	}
	const header = [
		...ascii("MThd"),
		...u32(6),
		...u16(0),
		...u16(1),
		...u16(PPQ),
		...ascii("MTrk"),
		...u32(track.length),
	];
	return new Blob([Uint8Array.from([...header, ...track])], { type: "audio/midi" });
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
