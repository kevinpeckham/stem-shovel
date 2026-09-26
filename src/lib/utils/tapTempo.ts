/** Taps older than this before the next reset the count: a new tempo is being tapped. */
const RESET_MS = 2000;
export const BPM_MIN = 30;
export const BPM_MAX = 300;

/**
 * The tempo a run of taps implies: the average gap between the last few
 * taps (timestamps in ms), as whole beats per minute within the metronome's
 * range; null until there are two taps close enough together.
 */
export function tapTempo(taps: number[]): number | null {
	const recent: number[] = [];
	for (const t of taps) {
		if (recent.length && t - recent[recent.length - 1] > RESET_MS) recent.length = 0;
		recent.push(t);
	}
	if (recent.length < 2) return null;
	const gaps = recent
		.slice(-8)
		.map((t, i, a) => (i === 0 ? 0 : t - a[i - 1]))
		.slice(1);
	const avg = gaps.reduce((s, g) => s + g, 0) / gaps.length;
	return Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(60000 / avg)));
}
