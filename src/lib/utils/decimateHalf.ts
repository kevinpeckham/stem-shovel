/**
 * Halves a signal's sample rate: the zero-phase FIR `taps` (odd length,
 * centered) applied at every other sample with zeros outside the signal,
 * `ceil(length / 2)` samples out, scaled by √2 (librosa's `resample(...,
 * scale=True)`, which the CQT's early downsampling uses).
 */
export function decimateHalf(y: ArrayLike<number>, taps: Float64Array): Float64Array {
	const len = y.length;
	const out = new Float64Array(Math.ceil(len / 2));
	const mid = (taps.length - 1) / 2;
	for (let j = 0; j < out.length; j++) {
		const start = 2 * j - mid;
		const nFrom = Math.max(0, -start);
		const nTo = Math.min(taps.length, len - start);
		let acc = 0;
		for (let n = nFrom; n < nTo; n++) acc += taps[n] * y[start + n];
		out[j] = acc * Math.SQRT2;
	}
	return out;
}
