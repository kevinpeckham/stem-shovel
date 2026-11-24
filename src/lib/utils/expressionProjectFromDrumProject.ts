import { DRUM_MACHINE_VELOCITY_MAP } from "#lib/constants/expressionDrums.js";
import type { DrumProject } from "#lib/val/DrumPatternSchema.js";
import type { ExpressionProject } from "#lib/val/ExpressionDrumSchema.js";

/**
 * A drum machine project as an expression drums project, losing nothing:
 * each cell's velocity becomes the main hit on the 1–5 scale
 * (DRUM_MACHINE_VELOCITY_MAP: 1→1, 2→3, 3→5) with no off-grid hits, and
 * each timeline entry a bar played once. Every other value (meters, steps,
 * voices, effects) is already valid in the expression format. A kit the
 * expression page lacks falls back to its default as it loads.
 */
export function expressionProjectFromDrumProject(p: DrumProject): ExpressionProject {
	return {
		v: 2,
		bpm: p.bpm,
		swing: p.swing,
		swingGrid: p.swingGrid,
		humanize: p.humanize,
		kit: p.kit,
		fx: { ...p.fx },
		patterns: p.patterns.map((pattern) => ({
			meter: pattern.meter,
			steps: pattern.steps,
			rows: pattern.rows.map((r) => ({
				...r,
				cells: r.cells.map((velocity) => ({
					main: DRUM_MACHINE_VELOCITY_MAP[velocity] ?? 0,
					t1: 0,
					half: 0,
					t2: 0,
				})),
			})),
		})),
		timeline: (p.timeline ?? []).map((pattern) => ({ pattern, reps: 1 })),
	};
}
