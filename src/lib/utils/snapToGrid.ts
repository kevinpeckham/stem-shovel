/** A time on the Studio's grid: the nearest beat when the grid is on, never before zero; the time itself (clamped) otherwise. */
export function snapToGrid(seconds: number, grid: { on: boolean; bpm: number }): number {
	if (!grid.on) return Math.max(0, seconds);
	const beat = 60 / grid.bpm;
	return Math.max(0, Math.round(seconds / beat) * beat);
}
