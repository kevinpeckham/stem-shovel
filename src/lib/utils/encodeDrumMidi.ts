import { DRUM_GM_NOTES, type DrumSwingGrid } from "#lib/constants/drumMachine.js";
import { drumSwingDelay } from "./drumSwingDelay";
import { midiFile, type MidiEvent } from "./midiFile";
import type { DrumPattern } from "#lib/val/DrumPatternSchema.js";

/**
 * A pattern, or a song of them bar after bar, as a Standard MIDI File
 * (format 0, one track, 96 ticks to the quarter note): the tempo, then
 * every hit as a General MIDI drum note on channel 10, swing moving the
 * swung steps late as the player does; the time signature is written
 * where it starts and wherever a bar changes it.
 * Velocity follows the cell (ghost 50, normal 100, accent 127) and the
 * row's level scales it, so the mix survives the trip into a DAW. Muted
 * rows are left out. Notes last half a step; drums only need the onset.
 */
const PPQ = 96;
const STEP_TICKS = PPQ / 4;
const VELOCITY = [0, 50, 100, 127];

export function encodeDrumMidi(
	bars: DrumPattern | DrumPattern[],
	bpm: number,
	swing: number,
	grid: DrumSwingGrid = 16,
): Blob {
	const sequence = Array.isArray(bars) ? bars : [bars];
	// Events as absolute ticks, sorted, then written with delta times.
	const events: MidiEvent[] = [];
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
	let start = 0;
	let meter: DrumPattern["meter"] | null = null;
	for (const pattern of sequence) {
		// The time signature: numerator, denominator as a power of two, MIDI clocks per beat, 32nds per quarter.
		if (pattern.meter !== meter) {
			meter = pattern.meter;
			const [nn, dd, cc] = meter === "3/4" ? [3, 2, 24] : meter === "6/8" ? [6, 3, 36] : [4, 2, 24];
			push(start, 0xff, 0x58, 0x04, nn, dd, cc, 8);
		}
		for (const row of pattern.rows) {
			if (row.mute) continue;
			const note = DRUM_GM_NOTES[row.voice];
			row.cells.forEach((cell, step) => {
				if (!cell) return;
				const late = Math.round(drumSwingDelay(step, STEP_TICKS, swing, grid));
				const tick = start + step * STEP_TICKS + late;
				const velocity = Math.max(1, Math.round((VELOCITY[cell] ?? 100) * (0.5 + row.level / 2)));
				push(tick, 0x99, note, velocity);
				push(tick + STEP_TICKS / 2, 0x89, note, 0);
			});
		}
		start += pattern.steps * STEP_TICKS;
	}
	return midiFile(events, PPQ, start);
}
