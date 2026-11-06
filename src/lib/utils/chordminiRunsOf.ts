/** Run-length encodes per-frame class indices as labeled runs, `end` exclusive. */
export function chordminiRunsOf(
	indices: Int32Array,
	labels: string[],
): { start: number; end: number; label: string }[] {
	const runs: { start: number; end: number; label: string }[] = [];
	for (let i = 0; i < indices.length;) {
		let j = i + 1;
		while (j < indices.length && indices[j] === indices[i]) j++;
		runs.push({ start: i, end: j, label: labels[indices[i]] });
		i = j;
	}
	return runs;
}
