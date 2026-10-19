/**
 * Time stretch by WSOLA (docs/dawn-daw-plan.md, D5): the audio cut into
 * overlapping Hann-windowed grains laid down at `ratio` times their
 * original spacing, each grain's position in the input nudged (within a
 * tolerance) to where it lines up best with what was last written, so the
 * overlaps add without the warble of a plain overlap-add. `ratio` 2 makes
 * the audio twice as long at the same pitch. Pure, over channel data; the
 * channels share the same alignment, so stereo stays stereo. A pitch shift
 * is a resample followed by a stretch back to length
 * (utils/resampleChannels.ts). Good for moderate ratios on musical audio;
 * a transient-aware library can replace it later.
 */
export function stretchChannels(
	channels: Float32Array[],
	ratio: number,
	sampleRate: number,
): Float32Array[] {
	const n = channels[0]?.length ?? 0;
	if (channels.length === 0 || n === 0 || !(ratio > 0)) return channels.map((c) => c.slice());
	if (Math.abs(ratio - 1) < 1e-6) return channels.map((c) => c.slice());
	const grain = Math.round(sampleRate * 0.05);
	const hop = Math.round(grain / 2);
	const tolerance = Math.round(sampleRate * 0.01);
	const outLength = Math.round(n * ratio);
	const out = channels.map(() => new Float32Array(outLength + grain));
	const norm = new Float32Array(outLength + grain);
	const window = new Float32Array(grain);
	for (let i = 0; i < grain; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / grain);
	const mono = new Float32Array(n);
	for (const ch of channels) for (let i = 0; i < n; i++) mono[i] += ch[i]! / channels.length;
	let prevIn = 0;
	for (let outPos = 0; outPos < outLength; outPos += hop) {
		const nominal = Math.round(outPos / ratio);
		// The grain that continues the last one best: compare the natural continuation of the previous grain with candidates around the nominal position.
		let bestIn = Math.min(Math.max(0, nominal), Math.max(0, n - grain));
		if (outPos > 0) {
			const target = prevIn + hop;
			let bestScore = -Infinity;
			const lo = Math.max(0, nominal - tolerance);
			const hi = Math.min(Math.max(0, n - grain), nominal + tolerance);
			for (let cand = lo; cand <= hi; cand += 8) {
				let score = 0;
				for (let i = 0; i < grain; i += 4) {
					const a = target + i < n ? mono[target + i]! : 0;
					score += a * mono[cand + i]!;
				}
				if (score > bestScore) {
					bestScore = score;
					bestIn = cand;
				}
			}
		}
		prevIn = bestIn;
		for (let c = 0; c < channels.length; c++) {
			const src = channels[c]!;
			const dst = out[c]!;
			for (let i = 0; i < grain; i++) {
				const s = bestIn + i;
				if (s >= n) break;
				dst[outPos + i] += src[s]! * window[i]!;
			}
		}
		for (let i = 0; i < grain; i++) norm[outPos + i] += window[i]!;
	}
	return out.map((dst) => {
		const trimmed = new Float32Array(outLength);
		for (let i = 0; i < outLength; i++) trimmed[i] = norm[i]! > 1e-3 ? dst[i]! / norm[i]! : dst[i]!;
		return trimmed;
	});
}
