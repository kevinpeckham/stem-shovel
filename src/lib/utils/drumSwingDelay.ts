import type { DrumSwingGrid } from "#lib/constants/drumMachine.js";

/**
 * How late swing pushes a step, in seconds. On the 16 grid every second
 * sixteenth (the odd steps) lands late by up to a third of a sixteenth,
 * so full swing is a triplet feel, the top of an MPC's range; the eighths
 * never move, which is why a beat with nothing on the odd sixteenths
 * sounds the same at any swing. On the 8 grid the off-beat eighths
 * (steps 2, 6, 10, 14) land late by up to a third of an eighth, and the
 * sixteenths beside them stay put. The one rule behind the live engine,
 * the WAV render and the MIDI file.
 */
export function drumSwingDelay(
	step: number,
	stepSeconds: number,
	swing: number,
	grid: DrumSwingGrid = 16,
): number {
	if (grid === 8) return step % 4 === 2 ? (swing * stepSeconds * 2) / 3 : 0;
	return step % 2 === 1 ? (swing * stepSeconds) / 3 : 0;
}
