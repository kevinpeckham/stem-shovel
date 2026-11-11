import {
	DEFAULT_DRUM_FX,
	DEFAULT_DRUM_SENDS,
	DEFAULT_HUMANIZE,
	DRUM_VELOCITY_NORMAL,
} from "#lib/constants/drumMachine.js";
import type { ExpressionProject, ExpressionRow } from "#lib/val/ExpressionDrumSchema.js";
import { EMPTY_CELL } from "#lib/val/ExpressionDrumSchema.js";

/** A row from a list of the steps it plays on (main hit only). */
function row(voice: ExpressionRow["voice"], steps: number, on: number[], level = 0.8): ExpressionRow {
	const cells = Array.from({ length: steps }, (_, i) =>
		on.includes(i) ? { ...EMPTY_CELL, main: DRUM_VELOCITY_NORMAL } : { ...EMPTY_CELL },
	);
	return { voice, level, pan: 0, mute: false, ...DEFAULT_DRUM_SENDS[voice], cells };
}

/**
 * The expression drums' starting project: a plain four-to-the-floor bar
 * at 100 bpm with the future kit.
 */
export function startingExpressionProject(): ExpressionProject {
	const steps = 16;
	return {
		v: 1,
		bpm: 100,
		swing: 0,
		swingGrid: 16,
		fx: { ...DEFAULT_DRUM_FX },
		humanize: DEFAULT_HUMANIZE,
		kit: "future",
		timeline: [],
		patterns: [
			{
				meter: "4/4",
				steps,
				rows: [
					row("kick", steps, [0, 4, 8, 12], 0.9),
					row("snare", steps, [4, 12], 0.8),
					row("hat-closed", steps, [0, 2, 4, 6, 8, 10, 12], 0.6),
					row("hat-open", steps, [14], 0.5),
					row("clap", steps, [], 0.7),
					row("rim", steps, [], 0.7),
					row("tom-low", steps, [], 0.8),
					row("tom-high", steps, [], 0.8),
				],
			},
		],
	};
}
