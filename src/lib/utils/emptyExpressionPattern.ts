import type { ExpressionPattern } from "#lib/val/ExpressionDrumSchema.js";
import { EMPTY_CELL } from "#lib/val/ExpressionDrumSchema.js";

/**
 * A new pattern in the shape of another: the same rows, levels and pans
 * with every cell off.
 */
export function emptyExpressionPattern(from: ExpressionPattern): ExpressionPattern {
	return {
		meter: from.meter,
		steps: from.steps,
		rows: from.rows.map((r) => ({ ...r, cells: r.cells.map(() => ({ ...EMPTY_CELL })) })),
	};
}
