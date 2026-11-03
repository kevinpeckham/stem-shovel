/** How far the app's swing moves the off-beat per unit: at 1 the "and" lands two thirds through the beat. */
const SWING_SPAN = 50 / 3;

/**
 * The app's swing amount (0 straight to 1 a triplet feel, `swingNotes`)
 * as barmark's swing percentage, where the off-beat eighth lands within
 * the beat: 50 + 16.67 × s, clamped to 0..1 first and rounded to one
 * decimal (barmark's precision). The inverse is `swingOfPercent`.
 */
export function swingPercentOf(swing: number): number {
	const s = Math.max(0, Math.min(1, swing));
	return Math.round((50 + SWING_SPAN * s) * 10) / 10;
}
