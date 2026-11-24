import type { DrumSteps } from "#lib/constants/expressionDrums.js";
import type { ExpressionPattern } from "#lib/val/ExpressionDrumSchema.js";
import { EMPTY_CELL } from "#lib/val/ExpressionDrumSchema.js";

/**
 * The same pattern with another number of steps. Nothing is cut: a row
 * keeps every cell it has ever had, and `steps` only says how many of them
 * show and play (visibleExpressionPattern). Shrinking hides the tail;
 * growing shows it again, so a meter or steps change and its reverse leave
 * the beat as composed, across reloads, undo and share links. Steps a row
 * has never had are filled by repeating its visible cells.
 */
export function resizeExpressionPattern(p: ExpressionPattern, steps: DrumSteps): ExpressionPattern {
	if (steps === p.steps) return p;
	return {
		meter: p.meter,
		steps,
		rows: p.rows.map((r) => {
			if (r.cells.length >= steps) return r;
			const span = Math.max(1, Math.min(p.steps, r.cells.length));
			const cells = r.cells.slice();
			for (let i = r.cells.length; i < steps; i++) {
				cells.push({ ...(r.cells[i % span] ?? EMPTY_CELL) });
			}
			return { ...r, cells };
		}),
	};
}
