import { decimateHalf } from "./decimateHalf";
import { kaiserHalfBand } from "./kaiserHalfBand";

/** One CQT bin's kernel: complex coefficients on a few rfft bins. */
export interface ChordminiPlanRow {
	/** The global bin, 0 (lowest) to nBins − 1. */
	bin: number;
	k: number[];
	re: number[];
	im: number[];
}

export interface ChordminiPlanOctave {
	index: number;
	sampleRate: number;
	hop: number;
	nFft: number;
	rows: ChordminiPlanRow[];
}

/** The shape of `src/lib/server/chordmini/cqt-plan.json`: librosa's CQT, baked. */
export interface ChordminiPlan {
	inputSampleRate: number;
	earlyDownsample: number;
	sampleRate: number;
	hop: number;
	nBins: number;
	/** Top octave first. */
	octaves: ChordminiPlanOctave[];
}

const LOG_FLOOR = 1e-6;

/** In-place radix-2 complex FFT (forward, unnormalized) of length re.length. */
function fft64(re: Float64Array, im: Float64Array): void {
	const n = re.length;
	for (let i = 1, j = 0; i < n; i++) {
		let bit = n >> 1;
		for (; j & bit; bit >>= 1) j ^= bit;
		j ^= bit;
		if (i < j) {
			const tr = re[i];
			re[i] = re[j];
			re[j] = tr;
			const ti = im[i];
			im[i] = im[j];
			im[j] = ti;
		}
	}
	for (let len = 2; len <= n; len <<= 1) {
		const half = len >> 1;
		const ang = (-2 * Math.PI) / len;
		for (let k = 0; k < half; k++) {
			const wr = Math.cos(ang * k);
			const wi = Math.sin(ang * k);
			for (let i = 0; i < n; i += len) {
				const a = i + k;
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

/** One octave's log-magnitude CQT: frames × the octave's rows, by frame. */
function octaveFeatures(y: Float64Array, octave: ChordminiPlanOctave): Float64Array[] {
	const { nFft, hop, rows } = octave;
	const pad = nFft / 2;
	const frames = 1 + Math.floor(y.length / hop);
	const re = new Float64Array(nFft);
	const im = new Float64Array(nFft);
	const out: Float64Array[] = [];
	for (let f = 0; f < frames; f++) {
		const start = f * hop - pad;
		for (let i = 0; i < nFft; i++) {
			const s = start + i;
			re[i] = s >= 0 && s < y.length ? y[s] : 0;
			im[i] = 0;
		}
		fft64(re, im);
		const values = new Float64Array(rows.length);
		for (let r = 0; r < rows.length; r++) {
			const row = rows[r];
			let sr = 0;
			let si = 0;
			for (let q = 0; q < row.k.length; q++) {
				const k = row.k[q];
				sr += row.re[q] * re[k] - row.im[q] * im[k];
				si += row.re[q] * im[k] + row.im[q] * re[k];
			}
			values[r] = Math.log(Math.hypot(sr, si) + LOG_FLOOR);
		}
		out.push(values);
	}
	return out;
}

/**
 * ChordMini's input features: librosa 0.11's CQT (as baked into `plan`)
 * of mono PCM at the plan's input rate, as `log(|CQT| + 1e-6)`, frame-major
 * `[frames][nBins]` with bin 0 the lowest. The signal is halved
 * `earlyDownsample` times first, then each octave (top first) is framed and
 * transformed on the signal at its rate and the signal halved again;
 * `frames` is the shortest octave's frame count (librosa's `__trim_stack`).
 */
export function chordminiFeatures(
	samples: Float32Array,
	plan: ChordminiPlan,
): { frames: number; features: Float32Array } {
	const taps = kaiserHalfBand();
	let y: Float64Array = Float64Array.from(samples);
	for (let i = 0; i < plan.earlyDownsample; i++) y = decimateHalf(y, taps);
	const perOctave: { rows: ChordminiPlanRow[]; values: Float64Array[] }[] = [];
	plan.octaves.forEach((octave, o) => {
		if (o > 0) y = decimateHalf(y, taps);
		perOctave.push({ rows: octave.rows, values: octaveFeatures(y, octave) });
	});
	const frames = Math.min(...perOctave.map((p) => p.values.length));
	const features = new Float32Array(frames * plan.nBins);
	for (const { rows, values } of perOctave) {
		for (let f = 0; f < frames; f++) {
			const base = f * plan.nBins;
			const row = values[f];
			for (let r = 0; r < rows.length; r++) features[base + rows[r].bin] = row[r];
		}
	}
	return { frames, features };
}
