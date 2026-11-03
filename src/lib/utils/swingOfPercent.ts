/**
 * A barmark swing percentage (where the off-beat eighth lands within the
 * beat, 50% to 75%) as the app's swing amount, 0 straight to 1 a triplet
 * feel: (p − 50) / 16.67, clamped to 0..1, so past 66.7% (toward the
 * dotted feel) is 1. The inverse of `swingPercentOf`.
 */
export function swingOfPercent(percent: number): number {
	return Math.max(0, Math.min(1, ((percent - 50) * 3) / 50));
}
