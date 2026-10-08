import type { StudioNote } from "../val/StudioSchema";

/**
 * Each note's start moved to the nearest line of a grid (docs/multitrack-
 * recorder.md, phase 3: Quantize): the grid's lines fall every `step`
 * seconds from `origin` on the timeline, and a note's timeline time is the
 * clip's content origin (`start - offset`) plus its `t`. Lengths are kept;
 * a note that would land before the clip's content origin stays at zero.
 * Sorted as the clip keeps them.
 */
export function quantizeNotes(
	notes: StudioNote[],
	grid: { origin: number; step: number; contentOrigin: number },
): StudioNote[] {
	if (grid.step <= 0) return notes.map((n) => ({ ...n }));
	return notes
		.map((n) => {
			const timeline = grid.contentOrigin + n.t;
			const snapped = grid.origin + Math.round((timeline - grid.origin) / grid.step) * grid.step;
			return { ...n, t: round4(Math.max(0, snapped - grid.contentOrigin)) };
		})
		.sort((a, b) => a.t - b.t || a.p - b.p);
}

const round4 = (x: number) => Math.round(x * 10000) / 10000;
