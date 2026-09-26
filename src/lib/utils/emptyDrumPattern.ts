import type { DrumPattern } from "$lib/val/DrumPatternSchema";

/**
 * A new pattern in the shape of another: the same rows, levels and pans
 * with every cell off. A song is usually played with one kit, so a new
 * pattern takes its rows from the one that was open.
 */
export function emptyDrumPattern(from: DrumPattern): DrumPattern {
	return {
		steps: from.steps,
		rows: from.rows.map((r) => ({ ...r, cells: r.cells.map(() => 0) })),
	};
}
