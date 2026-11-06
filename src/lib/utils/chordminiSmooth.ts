/** The first class with the largest logits summed over frames `from..to` (inclusive). */
function argmaxOfSum(
	logits: Float32Array,
	from: number,
	to: number,
	classes: number,
	sum: Float64Array,
): number {
	sum.fill(0);
	for (let f = from; f <= to; f++) {
		const base = f * classes;
		for (let c = 0; c < classes; c++) sum[c] += logits[base + c];
	}
	let best = 0;
	for (let c = 1; c < classes; c++) if (sum[c] > sum[best]) best = c;
	return best;
}

/**
 * ChordMini's decoding: the logits `[frames][classes]` cut into windows of
 * `seqLen` frames from frame 0 (the last one shorter), and in each window
 * every frame's class is the argmax (the first on a tie) of the logits
 * summed over the frames within `radius` of it, inside the window only.
 */
export function chordminiIndices(
	logits: Float32Array,
	frames: number,
	classes = 170,
	seqLen = 108,
	radius = 4,
): Int32Array {
	const out = new Int32Array(frames);
	const sum = new Float64Array(classes);
	for (let i = 0; i < frames; i++) {
		const windowStart = i - (i % seqLen);
		const windowLast = Math.min(frames, windowStart + seqLen) - 1;
		const from = Math.max(windowStart, i - radius);
		const to = Math.min(windowLast, i + radius);
		out[i] = argmaxOfSum(logits, from, to, classes, sum);
	}
	return out;
}
