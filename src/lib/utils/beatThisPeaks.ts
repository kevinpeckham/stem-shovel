const KERNEL_RADIUS = 3;

/** Whether frame `i` equals the 7-frame sliding max around it (−∞ beyond the edges). */
function isWindowMax(logits: Float32Array, i: number): boolean {
	const from = Math.max(0, i - KERNEL_RADIUS);
	const to = Math.min(logits.length - 1, i + KERNEL_RADIUS);
	for (let j = from; j <= to; j++) if (logits[j] > logits[i]) return false;
	return true;
}

/**
 * Beat This's `deduplicate_peaks` verbatim: peaks within `width` frames of
 * the running position merge into one. The running position is a running
 * mean (`p += (p2 − p) / c`), and each next peak is compared against that
 * mean, not against the previous peak, so the result can be fractional.
 */
function deduplicate(peaks: number[], width: number): number[] {
	const result: number[] = [];
	if (peaks.length === 0) return result;
	let p = peaks[0];
	let c = 1;
	for (let i = 1; i < peaks.length; i++) {
		const p2 = peaks[i];
		if (p2 - p <= width) {
			c += 1;
			p += (p2 - p) / c;
		} else {
			result.push(p);
			p = p2;
			c = 1;
		}
	}
	result.push(p);
	return result;
}

/**
 * Peak times in seconds from one row of framewise logits, as Beat This's
 * "minimal" postprocessor: a frame is a peak when it equals the max over the
 * 7 frames centered on it (`max_pool1d(x, 7, 1, 3)`, padded with −∞) and is
 * above 0; neighboring peaks merge with `deduplicate_peaks(width=1)`; frames
 * become seconds at `fps`.
 */
export function beatThisPeaks(logits: Float32Array, fps = 50): number[] {
	const peaks: number[] = [];
	for (let i = 0; i < logits.length; i++) {
		if (logits[i] > 0 && isWindowMax(logits, i)) peaks.push(i);
	}
	return deduplicate(peaks, 1).map((frame) => frame / fps);
}
