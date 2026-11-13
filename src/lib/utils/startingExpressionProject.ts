import { DEFAULT_DRUM_FX } from "#lib/constants/drumMachine.js";
import type { ExpressionCell, ExpressionProject, ExpressionRow } from "#lib/val/ExpressionDrumSchema.js";
import { EMPTY_CELL } from "#lib/val/ExpressionDrumSchema.js";

type Cell = [main: number, t1?: number, half?: number, t2?: number];

/** A row from compact cell tuples: [main] or [main, t1, half, t2]. */
function row(
	voice: ExpressionRow["voice"],
	level: number,
	pan: number,
	delaySend: number,
	reverbSend: number,
	cells: Cell[],
): ExpressionRow {
	return {
		voice,
		level,
		pan,
		mute: false,
		delaySend,
		reverbSend,
		cells: cells.map(
			([main, t1 = 0, half = 0, t2 = 0]): ExpressionCell => ({ main, t1, half, t2 }),
		),
	};
}

/** Shorthand for an empty cell tuple. */
const _ = [0] satisfies Cell;

/**
 * The expression drums' starting project: a 3/4 waltz at 160 bpm on the
 * future kit, with sub-hits on kick and snare to show off the expression
 * cells.
 */
export function startingExpressionProject(): ExpressionProject {
	return {
		v: 1,
		bpm: 160,
		swing: 0,
		swingGrid: 16,
		fx: { ...DEFAULT_DRUM_FX },
		humanize: 0.14,
		kit: "future",
		timeline: [],
		patterns: [
			{
				meter: "3/4",
				steps: 24,
				rows: [
					row("kick", 0.6, 0, 0.15, 0.3, [
						[2], _, [3, 1], _, _, _, _, _, _, _, _, _,
						_, _, _, _, _, _, _, _, _, _, [0, 1], _,
					]),
					row("snare", 0.6, 0, 0.45, 0.8, [
						[3], _, _, _, _, _, [0, 0, 0, 2], _, _, _, _, _,
						[2], _, _, _, _, _, [0, 0, 0, 2], _, _, _, [0, 1], _,
					]),
					row("hat-closed", 0.63, 0, 0.3, 0.3, [
						[5], _, _, _, [3], _, _, _, [4], _, _, _,
						[4], _, _, _, [3], _, _, _, [4], _, _, _,
					]),
					row("hat-open", 0.63, 0, 0.4, 0.5, Array.from({ length: 24 }, () => _ as Cell)),
					row("clap", 0.7, 0, 0.5, 0.9, Array.from({ length: 24 }, () => _ as Cell)),
					row("rim", 0.7, 0, 0.8, 0.4, Array.from({ length: 24 }, () => _ as Cell)),
					row("tom-low", 0.53, 0, 0.3, 0.6, Array.from({ length: 24 }, () => _ as Cell)),
					row("tom-high", 0.52, 0, 0.3, 0.6, Array.from({ length: 24 }, () => _ as Cell)),
					row("tom-mid", 0.8, -0.1, 0.3, 0.6, Array.from({ length: 24 }, () => _ as Cell)),
					row("ride", 0.59, 0.4, 0.3, 0.6, Array.from({ length: 24 }, () => _ as Cell)),
				],
			},
		],
	};
}
