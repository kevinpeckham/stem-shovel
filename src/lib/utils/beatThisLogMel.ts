import { beatThisMelBank, type BeatThisMelBand } from "./beatThisMelBank";

const N_FFT = 1024;
const HOP = 441;
const N_MELS = 128;
const N_FREQS = N_FFT / 2 + 1;
const PAD = N_FFT / 2;
/** torch.stft with `normalized=True` scales by frame_length ** -0.5. */
const NORM = 1 / Math.sqrt(N_FFT);

interface Tables {
	window: Float64Array;
	bitrev: Uint16Array;
	cos: Float64Array;
	sin: Float64Array;
	bank: BeatThisMelBand[];
}

let tables: Tables | null = null;

function bitReversal(n: number): Uint16Array {
	const out = new Uint16Array(n);
	for (let i = 1, j = 0; i < n; i++) {
		let bit = n >> 1;
		for (; j & bit; bit >>= 1) j ^= bit;
		j ^= bit;
		out[i] = j;
	}
	return out;
}

/** The window, FFT tables and filterbank, built on first use. */
function tablesOf(): Tables {
	if (tables) return tables;
	// torch.hann_window(1024) is periodic: 0.5 − 0.5 cos(2πn / N).
	const window = Float64Array.from(
		{ length: N_FFT },
		(_, n) => 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / N_FFT),
	);
	const cos = Float64Array.from({ length: N_FFT / 2 }, (_, k) =>
		Math.cos((-2 * Math.PI * k) / N_FFT),
	);
	const sin = Float64Array.from({ length: N_FFT / 2 }, (_, k) =>
		Math.sin((-2 * Math.PI * k) / N_FFT),
	);
	tables = { window, bitrev: bitReversal(N_FFT), cos, sin, bank: beatThisMelBank(N_FREQS) };
	return tables;
}

/** In-place radix-2 forward FFT of length N_FFT; `re`/`im` already in bit-reversed order. */
function fft(re: Float64Array, im: Float64Array, t: Tables): void {
	for (let len = 2; len <= N_FFT; len <<= 1) {
		const half = len >> 1;
		const stride = N_FFT / len;
		for (let k = 0; k < half; k++) {
			const wr = t.cos[k * stride];
			const wi = t.sin[k * stride];
			for (let a = k; a < N_FFT; a += len) {
				const b = a + half;
				const tr = re[b] * wr - im[b] * wi;
				const ti = re[b] * wi + im[b] * wr;
				re[b] = re[a] - tr;
				im[b] = im[a] - ti;
				re[a] += tr;
				im[a] += ti;
			}
		}
	}
}

/** Sample `i` of the signal reflect-padded on both sides (torch's "reflect", edge not repeated). */
function reflected(samples: Float32Array, i: number): number {
	const n = samples.length;
	if (n === 1) return samples[0];
	const period = 2 * (n - 1);
	let j = i % period;
	if (j < 0) j += period;
	return samples[j < n ? j : period - j];
}

/** One frame's windowed samples, loaded straight into bit-reversed order. */
function loadFrame(
	samples: Float32Array,
	frame: number,
	re: Float64Array,
	im: Float64Array,
	t: Tables,
): void {
	const start = frame * HOP - PAD;
	const inside = start >= 0 && start + N_FFT <= samples.length;
	for (let i = 0; i < N_FFT; i++) {
		const s = inside ? samples[start + i] : reflected(samples, start + i);
		const r = t.bitrev[i];
		re[r] = s * t.window[i];
		im[r] = 0;
	}
}

/** The frame's magnitudes through the filterbank, as log1p(1000 · mel), into `out` at `base`. */
function writeMels(
	re: Float64Array,
	im: Float64Array,
	mag: Float64Array,
	out: Float32Array,
	base: number,
	t: Tables,
): void {
	for (let k = 0; k < N_FREQS; k++) mag[k] = Math.hypot(re[k], im[k]) * NORM;
	for (let m = 0; m < N_MELS; m++) {
		const { start, weights } = t.bank[m];
		let sum = 0;
		for (let q = 0; q < weights.length; q++) sum += weights[q] * mag[start + q];
		out[base + m] = Math.log1p(1000 * sum);
	}
}

/**
 * Beat This's input: torchaudio's `MelSpectrogram` as its `LogMelSpect`
 * configures it, for mono PCM at 22050 Hz. A 1024-point STFT with a periodic
 * Hann window and hop 441 (50 frames a second), centered by reflect-padding
 * 512 samples on each side, so `frames = 1 + floor(length / 441)`. Its
 * magnitude (power 1) is scaled by 1024 ** -0.5: `normalized="frame_length"`
 * makes torchaudio's `spectrogram` pass `normalized=True` to `torch.stft`,
 * which divides by sqrt(frame_length), and the window-energy norm is not
 * applied. Then 128 slaney mel bands from 30 Hz to 11 kHz (no area norm) and
 * `log1p(1000 · mel)`. Row-major `[frames][128]`; float64 inside.
 */
export function beatThisLogMel(samples: Float32Array): {
	frames: number;
	mels: number;
	data: Float32Array;
} {
	const t = tablesOf();
	const frames = 1 + Math.floor(samples.length / HOP);
	const data = new Float32Array(frames * N_MELS);
	if (samples.length === 0) return { frames, mels: N_MELS, data };
	const re = new Float64Array(N_FFT);
	const im = new Float64Array(N_FFT);
	const mag = new Float64Array(N_FREQS);
	for (let f = 0; f < frames; f++) {
		loadFrame(samples, f, re, im, t);
		fft(re, im, t);
		writeMels(re, im, mag, data, f * N_MELS, t);
	}
	return { frames, mels: N_MELS, data };
}
