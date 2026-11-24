import type { ExpressionPattern } from "#lib/val/ExpressionDrumSchema.js";

/**
 * The pattern as it sounds: each row's cells cut to `steps`. A row may hold
 * more (cells hidden by a shrink, kept for when it grows again;
 * resizeExpressionPattern), so anything that walks every cell, such as
 * export or the generator, takes this instead of the stored pattern.
 */
export function visibleExpressionPattern(p: ExpressionPattern): ExpressionPattern {
	if (p.rows.every((r) => r.cells.length <= p.steps)) return p;
	return { ...p, rows: p.rows.map((r) => ({ ...r, cells: r.cells.slice(0, p.steps) })) };
}
