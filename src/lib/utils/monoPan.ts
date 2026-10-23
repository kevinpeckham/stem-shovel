/**
 * The pan law for a mono signal (the stem player's mono stems and Dawn's
 * mono tracks, docs/multitrack-recorder.md "Mono tracks"): a position,
 * not a balance. At center the signal sits at unity in both channels, as
 * it did before pans (a StereoPannerNode would drop it 3 dB); as it
 * turns, the far channel falls away on a sine and the near one stays.
 */
export function monoPan(pan: number): { left: number; right: number } {
	return {
		left: pan > 0 ? Math.cos((pan * Math.PI) / 2) : 1,
		right: pan < 0 ? Math.sin(((pan + 1) * Math.PI) / 2) : 1,
	};
}

/**
 * The same law as two WaveShaper curves over a pan of −1…1, so a single
 * AudioParam (a ConstantSourceNode's offset) can drive both channel gains
 * and a pan lane schedules on it as on a StereoPannerNode's `pan`.
 */
export function monoPanCurves(points = 1025): {
	left: Float32Array<ArrayBuffer>;
	right: Float32Array<ArrayBuffer>;
} {
	const left = new Float32Array(points);
	const right = new Float32Array(points);
	for (let i = 0; i < points; i++) {
		const w = monoPan(-1 + (2 * i) / (points - 1));
		left[i] = w.left;
		right[i] = w.right;
	}
	return { left, right };
}
