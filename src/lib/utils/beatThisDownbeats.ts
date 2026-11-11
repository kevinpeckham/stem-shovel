/** The beat nearest `time`, the first one on a tie (numpy's argmin). */
function nearest(beats: number[], time: number): number {
	let best = 0;
	for (let i = 1; i < beats.length; i++) {
		if (Math.abs(beats[i] - time) < Math.abs(beats[best] - time)) best = i;
	}
	return beats[best];
}

/**
 * Beat This's downbeat cleanup: each downbeat moved to its nearest beat,
 * then sorted with duplicates removed (`np.unique`), so every downbeat is
 * also a beat. With no beats the downbeats come back unchanged.
 */
export function beatThisDownbeats(beats: number[], downbeats: number[]): number[] {
	if (beats.length === 0) return downbeats;
	const snapped = new Set(downbeats.map((d) => nearest(beats, d)));
	return [...snapped].sort((a, b) => a - b);
}
