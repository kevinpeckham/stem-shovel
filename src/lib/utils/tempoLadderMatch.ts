/**
 * The rungs of the tempo ladder other than the direct one: double, half,
 * the 3:2 pair, and three (a waltz's beats against its bar).
 */
export const TEMPO_LADDER_RUNGS = [2, 0.5, 1.5, 2 / 3, 3] as const;

/**
 * The rung at which a declared tempo and a detected one are the same grid,
 * or null. factor 1 = direct; otherwise `declared ≈ detected × factor` (a
 * fast waltz declared 224 and detected 112 matches at 2: counted in
 * eighths). Direct is tried first, then double and half, then 1.5 and 2/3
 * only when `compound`, then 3 only when `triple`. Both gates belong to
 * the declared meter (the band's intent), never to the detector's own
 * subdivision flag: stem-bench Study 11b found that flag firing at a pulse
 * two thirds off (a song at 145 detected at 96.7, a third of which is the
 * true eighth), and opening the 3:2 rungs on it excused exactly the gap
 * the comparison should expose. A 2/3 reading on a straight meter is a
 * real error, not a count (docs/tempo-grid-plan.md). ×3 is the fast waltz
 * counted three to the bar while the stems hear the bar as one beat (224
 * in 3/4 against a detected 74.7 in 6/8). `tolerance` is absolute bpm,
 * default 3.
 */
export function tempoLadderMatch(
	declared: number,
	detected: number,
	opts: { compound?: boolean; triple?: boolean; tolerance?: number } = {},
): { factor: number } | null {
	if (!(Number.isFinite(declared) && declared > 0 && Number.isFinite(detected) && detected > 0)) {
		return null;
	}
	const tolerance = opts.tolerance ?? 3;
	const factors = [1, 2, 0.5, ...(opts.compound ? [1.5, 2 / 3] : []), ...(opts.triple ? [3] : [])];
	const factor = factors.find((f) => Math.abs(declared - detected * f) <= tolerance);
	return factor === undefined ? null : { factor };
}
