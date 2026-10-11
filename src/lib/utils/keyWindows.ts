/**
 * Where a song without sections is read for its keys (docs/audio-engine.md,
 * "Several keys"): every ten seconds, the last window never shorter than
 * five, starting at 0. A song shorter than fifteen seconds is one window.
 */
export function keyWindows(durationSeconds: number, windowSeconds = 10): number[] {
	const out = [0];
	for (let t = windowSeconds; t < durationSeconds - windowSeconds / 2; t += windowSeconds)
		out.push(t);
	return out;
}
