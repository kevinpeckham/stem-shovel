/** Taps of the half-band low-pass (scipy's `firwin(255, 0.48, window=("kaiser", 12))`). */
const TAPS = 255;
const CUTOFF = 0.48;
const BETA = 12;

/** The modified Bessel function of order zero, by its power series. */
function besselI0(x: number): number {
	let sum = 0;
	let term = 1;
	for (let m = 0; m < 50; m++) {
		if (m > 0) term *= x / 2 / m;
		sum += term * term;
	}
	return sum;
}

/**
 * The Kaiser-windowed FIR low-pass the ChordMini CQT decimates with before
 * and between octaves: 255 taps, cutoff 0.48 of the input Nyquist, Kaiser
 * beta 12, normalized so the taps sum to 1 (scipy's `firwin` with
 * `scale=True`), the stand-in for librosa's soxr resampler.
 */
export function kaiserHalfBand(): Float64Array {
	const taps = new Float64Array(TAPS);
	const mid = (TAPS - 1) / 2;
	const i0Beta = besselI0(BETA);
	let sum = 0;
	for (let n = 0; n < TAPS; n++) {
		const x = n - mid;
		const arg = Math.PI * CUTOFF * x;
		const sinc = x === 0 ? 1 : Math.sin(arg) / arg;
		const r = x / mid;
		const window = besselI0(BETA * Math.sqrt(Math.max(0, 1 - r * r))) / i0Beta;
		taps[n] = sinc * CUTOFF * window;
		sum += taps[n];
	}
	for (let n = 0; n < TAPS; n++) taps[n] /= sum;
	return taps;
}
