import type { DrumSteps } from "#lib/constants/expressionDrums.js";
import type { ExpressionCell, ExpressionPattern } from "#lib/val/ExpressionDrumSchema.js";
import { EMPTY_CELL } from "#lib/val/ExpressionDrumSchema.js";

/**
 * Cut cells stashed per row voice so a shrink followed by a grow restores
 * what was there instead of tiling or filling with rests.
 */
const stash = new Map<string, ExpressionCell[]>();

/** A key for the stash: pattern index + voice, so each row's overflow is kept separately. */
function stashKey(patternIndex: number, voice: string): string {
	return `${patternIndex}:${voice}`;
}

/**
 * The same pattern with another number of steps: cells that still fit are
 * kept, the rest stashed so they come back if the pattern grows again.
 * Growing restores stashed cells first, then tiles what remains.
 */
export function resizeExpressionPattern(
	p: ExpressionPattern,
	steps: DrumSteps,
	patternIndex = 0,
): ExpressionPattern {
	if (steps === p.steps) return p;
	return {
		meter: p.meter,
		steps,
		rows: p.rows.map((r) => {
			const key = stashKey(patternIndex, r.voice);
			if (steps < p.steps) {
				// Shrinking: stash the cells that are being cut.
				stash.set(key, r.cells.slice(steps));
			}
			const saved = stash.get(key);
			const cells = Array.from({ length: steps }, (_, i) => {
				if (i < r.cells.length) return r.cells[i]!;
				// Beyond the current cells: restore from stash if available.
				const stashIndex = i - r.cells.length;
				if (saved && stashIndex < saved.length) return saved[stashIndex]!;
				// No stash: tile from the existing cells.
				return { ...(r.cells[i % p.steps] ?? EMPTY_CELL) };
			});
			if (steps >= p.steps) {
				// Growing: clear the stash since we've consumed it.
				stash.delete(key);
			}
			return { ...r, cells };
		}),
	};
}
