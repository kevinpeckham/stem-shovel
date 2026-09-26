import type { DrumSteps } from "$lib/constants/drumMachine";
import type { DrumPattern } from "$lib/val/DrumPatternSchema";

/**
 * The same pattern with another number of steps: cells that still fit are
 * kept, the rest cut or filled with rests. Growing a bar to two repeats it
 * rather than leaving the second bar empty, which is what a person wants
 * nearly every time (a fill goes in afterwards).
 */
export function resizeDrumPattern(p: DrumPattern, steps: DrumSteps): DrumPattern {
	if (steps === p.steps) return p;
	return {
		steps,
		rows: p.rows.map((r) => ({
			...r,
			cells: Array.from({ length: steps }, (_, i) =>
				steps > p.steps ? (r.cells[i % p.steps] ?? 0) : (r.cells[i] ?? 0),
			),
		})),
	};
}
