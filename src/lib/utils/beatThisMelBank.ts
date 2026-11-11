/** One mel band as its nonzero weights: `weights[i]` applies to FFT bin `start + i`. */
export interface BeatThisMelBand {
	start: number;
	weights: Float64Array;
}

const F_SP = 200 / 3;
const MIN_LOG_HZ = 1000;
const MIN_LOG_MEL = MIN_LOG_HZ / F_SP;
const LOG_STEP = Math.log(6.4) / 27;

/** Slaney's mel scale: linear below 1 kHz, logarithmic above. */
function hzToMel(hz: number): number {
	return hz >= MIN_LOG_HZ ? MIN_LOG_MEL + Math.log(hz / MIN_LOG_HZ) / LOG_STEP : hz / F_SP;
}

function melToHz(mel: number): number {
	return mel >= MIN_LOG_MEL ? MIN_LOG_HZ * Math.exp(LOG_STEP * (mel - MIN_LOG_MEL)) : F_SP * mel;
}

/** Band `m`'s weight at frequency `f` given the band edges `pts`: the triangle, clipped at zero. */
function triangle(pts: Float64Array, m: number, f: number): number {
	const down = (pts[m + 2] - f) / (pts[m + 2] - pts[m + 1]);
	const up = (f - pts[m]) / (pts[m + 1] - pts[m]);
	return Math.max(0, Math.min(down, up));
}

/**
 * torchaudio's `melscale_fbanks` as Beat This configures it (`mel_scale="slaney"`,
 * `norm=None`): `nMels` triangular filters over the `nFreqs` bins of
 * `linspace(0, sampleRate // 2, nFreqs)`, their corners evenly spaced in mels
 * from `fMin` to `fMax`, peak weight 1 and no area normalization. Computed in
 * float64 (torchaudio uses float32). Each band keeps only its nonzero run of
 * bins, so applying it is cheap.
 */
export function beatThisMelBank(
	nFreqs = 513,
	sampleRate = 22050,
	fMin = 30,
	fMax = 11000,
	nMels = 128,
): BeatThisMelBand[] {
	const nyquist = Math.floor(sampleRate / 2);
	const freqs = Float64Array.from({ length: nFreqs }, (_, i) => (nyquist * i) / (nFreqs - 1));
	const mMin = hzToMel(fMin);
	const mMax = hzToMel(fMax);
	const pts = Float64Array.from({ length: nMels + 2 }, (_, i) =>
		melToHz(mMin + ((mMax - mMin) * i) / (nMels + 1)),
	);
	const bands: BeatThisMelBand[] = [];
	for (let m = 0; m < nMels; m++) {
		const weights: number[] = [];
		let start = -1;
		for (let k = 0; k < nFreqs; k++) {
			const w = triangle(pts, m, freqs[k]);
			if (w <= 0) continue;
			if (start < 0) start = k;
			// Fill any gap so `weights` stays contiguous (a triangle has none).
			while (start + weights.length < k) weights.push(0);
			weights.push(w);
		}
		bands.push({ start: Math.max(start, 0), weights: Float64Array.from(weights) });
	}
	return bands;
}
