/** The rungs of the tempo ladder other than the direct one: double, half, and the 3:2 pair. */
export const TEMPO_LADDER_RUNGS = [2, 0.5, 1.5, 2 / 3] as const;

/**
 * The rung at which a declared tempo and a detected one are the same grid,
 * or null. factor 1 = direct; otherwise `declared ≈ detected × factor` (a
 * fast waltz declared 224 and detected 112 matches at 2: counted in
 * eighths). Direct is tried first, then double and half, then 1.5 and 2/3
 * only when `compound` says the meter divides in three: a 2/3 reading on a
 * straight meter is a real error, not a count (docs/tempo-grid-plan.md).
 * `tolerance` is absolute bpm, default 3.
 */
export function tempoLadderMatch(
	declared: number,
	detected: number,
	opts: { compound?: boolean; tolerance?: number } = {},
): { factor: number } | null {
	if (!(Number.isFinite(declared) && declared > 0 && Number.isFinite(detected) && detected > 0)) {
		return null;
	}
	const tolerance = opts.tolerance ?? 3;
	const factors = opts.compound ? [1, ...TEMPO_LADDER_RUNGS] : [1, 2, 0.5];
	const factor = factors.find((f) => Math.abs(declared - detected * f) <= tolerance);
	return factor === undefined ? null : { factor };
}
