/**
 * One humanized hit's scatter: a time offset in seconds (up to `humanize` ×
 * 30 ms either way) and a velocity delta (up to ±`humanize` × 0.2), both 0
 * when `humanize` is 0. These are the Studio's amounts (`swingNotes` shares
 * them), so the progression pad and the Studio feel the same. `humanize` is
 * clamped to 0..1; `random` (0..1) is drawn twice, time then velocity, and a
 * test pins it.
 */
export function humanizeOffsets(
	humanize: number,
	random: () => number = Math.random,
): { seconds: number; velocity: number } {
	const h = Math.max(0, Math.min(1, humanize));
	if (!(h > 0)) return { seconds: 0, velocity: 0 };
	const seconds = (random() * 2 - 1) * 0.03 * h;
	const velocity = (random() * 2 - 1) * 0.2 * h;
	return { seconds, velocity };
}
