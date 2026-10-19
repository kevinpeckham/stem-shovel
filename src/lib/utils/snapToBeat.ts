import { barAt, secondsAtBar, type BarGrid } from "#lib/audio/measures.js";

/**
 * A time onto the nearest division of a beat on the grid (docs/dawn-daw-plan.md,
 * D5): `division` 1 is the beat, 2 the half, 4 the quarter. Follows tempo
 * and meter changes (the grid's bars and beats are in seconds already).
 * Never before zero.
 */
export function snapToBeat(grid: BarGrid, seconds: number, division = 1): number {
	const t = Math.max(0, seconds);
	const pos = barAt(grid, t);
	const steps = Math.max(1, Math.round(division));
	const k = Math.round(pos.fraction * steps);
	const at = secondsAtBar(grid, pos.bar, pos.beat, k / steps);
	return Math.max(0, Math.round(at * 10000) / 10000);
}
