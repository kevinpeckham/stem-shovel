import type { DrumSteps } from "#lib/constants/drumMachine.js";
import type { ExpressionPattern } from "#lib/val/ExpressionDrumSchema.js";
import { EMPTY_CELL } from "#lib/val/ExpressionDrumSchema.js";

/**
 * The same pattern with another number of steps: cells that still fit are
 * kept, the rest cut or filled with rests. Growing a bar to two repeats it
 * rather than leaving the second bar empty.
 */
export function resizeExpressionPattern(p: ExpressionPattern, steps: DrumSteps): ExpressionPattern {
	if (steps === p.steps) return p;
	return {
		meter: p.meter,
		steps,
		rows: p.rows.map((r) => ({
			...r,
			cells: Array.from({ length: steps }, (_, i) =>
				steps > p.steps ? (r.cells[i % p.steps] ?? { ...EMPTY_CELL }) : (r.cells[i] ?? { ...EMPTY_CELL }),
			),
		})),
	};
}
