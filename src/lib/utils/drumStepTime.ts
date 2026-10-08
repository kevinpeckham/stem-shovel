import type { DrumSwingGrid } from "#lib/constants/drumMachine.js";
import { drumSwingDelay } from "./drumSwingDelay";

/**
 * When a step sounds, in seconds from the start of the pattern: sixteenths
 * at the tempo, plus the swing delay (drumSwingDelay: every second
 * sixteenth late by up to a third of a step).
 */
export function drumStepTime(
	step: number,
	bpm: number,
	swing: number,
	grid: DrumSwingGrid = 16,
): number {
	const stepSeconds = 60 / bpm / 4;
	return step * stepSeconds + drumSwingDelay(step, stepSeconds, swing, grid);
}
