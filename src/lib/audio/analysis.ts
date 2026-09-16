/**
 * Tempo, key and time-signature detection from decoded audio, in the browser,
 * at upload time. Deterministic signal processing, no model: an onset
 * strength envelope (spectral flux) autocorrelated for the tempo, beat
 * groupings compared for 4/4 against 3/4, and a chroma profile matched
 * against the Krumhansl-Kessler key templates. Features are extracted per
 * stem and summed, so a batch of stems is analysed as one mix.
 */
export interface Features {
	/** Onset strength per frame. */
	onset: Float32Array;
	/** Frames per second of `onset`. */
	fps: number;
	/** Energy per pitch class, C first. */
	chroma: Float32Array;
}

export interface Detection {
	tempo: { bpm: number; confidence: number };
	meter: { value: "4/4" | "3/4"; confidence: number };
	key: { value: string; confidence: number };
}

const FRAME = 2048;
const HOP = 512;
/** Chroma needs finer bins than onsets: 8192 at 32 kHz is 3.9 Hz, under a semitone from 110 Hz up. */
const CHROMA_FRAME = 8192;
const CHROMA_HOP = 4096;
const NOTE_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];

/** In-place radix-2 FFT; `re.length` must be a power of two. */
export function fft(re: Float32Array, im: Float32Array): void {
	const n = re.length;
	for (let i = 1, j = 0; i < n; i++) {
		let bit = n >> 1;
		for (; j & bit; bit >>= 1) j ^= bit;
		j ^= bit;
		if (i < j) {
			[re[i], re[j]] = [re[j], re[i]];
			[im[i], im[j]] = [im[j], im[i]];
		}
	}
	for (let len = 2; len <= n; len <<= 1) {
		const ang = (-2 * Math.PI) / len;
		const wr = Math.cos(ang);
		const wi = Math.sin(ang);
		for (let i = 0; i < n; i += len) {
			let cr = 1;
			let ci = 0;
			for (let k = 0; k < len / 2; k++) {
				const a = i + k;
				const b = a + len / 2;
				const tr = re[b] * cr - im[b] * ci;
				const ti = re[b] * ci + im[b] * cr;
				re[b] = re[a] - tr;
				im[b] = im[a] - ti;
				re[a] += tr;
				im[a] += ti;
				const ncr = cr * wr - ci * wi;
				ci = cr * wi + ci * wr;
				cr = ncr;
			}
		}
	}
}

/** Onset envelope and chroma of the first `maxSeconds` of a buffer (channels averaged). */
export function extractFeatures(buffer: AudioBuffer, maxSeconds = 90): Features {
	const sr = buffer.sampleRate;
	const length = Math.min(buffer.length, Math.floor(maxSeconds * sr));
	const mono = new Float32Array(length);
	for (let c = 0; c < buffer.numberOfChannels; c++) {
		const data = buffer.getChannelData(c);
		for (let i = 0; i < length; i++) mono[i] += data[i] / buffer.numberOfChannels;
	}
	const frames = Math.max(0, Math.floor((length - FRAME) / HOP) + 1);
	const onset = new Float32Array(frames);
	const chroma = new Float32Array(12);
	const window = new Float32Array(FRAME);
	for (let i = 0; i < FRAME; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FRAME);
	const re = new Float32Array(FRAME);
	const im = new Float32Array(FRAME);
	const bins = FRAME / 2;
	let previous = new Float32Array(bins);
	for (let t = 0; t < frames; t++) {
		const start = t * HOP;
		for (let i = 0; i < FRAME; i++) {
			re[i] = mono[start + i] * window[i];
			im[i] = 0;
		}
		fft(re, im);
		const magnitude = new Float32Array(bins);
		let flux = 0;
		for (let b = 0; b < bins; b++) {
			const m = Math.log1p(10 * Math.hypot(re[b], im[b]));
			magnitude[b] = m;
			const rise = m - previous[b];
			if (rise > 0) flux += rise;
		}
		onset[t] = flux;
		previous = magnitude;
	}
	chromaOf(mono, sr, chroma);
	return { onset, fps: sr / HOP, chroma };
}

/** Adds the pitch-class energy of `mono` (110 Hz – 4.2 kHz, linear magnitude) into `chroma`. */
function chromaOf(mono: Float32Array, sr: number, chroma: Float32Array): void {
	const bins = CHROMA_FRAME / 2;
	const binClass = new Int8Array(bins).fill(-1);
	for (let b = 1; b < bins; b++) {
		const f = (b * sr) / CHROMA_FRAME;
		if (f < 110 || f > 4200) continue;
		binClass[b] = (((Math.round(12 * Math.log2(f / 440)) + 9) % 12) + 12) % 12;
	}
	const window = new Float32Array(CHROMA_FRAME);
	for (let i = 0; i < CHROMA_FRAME; i++) {
		window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / CHROMA_FRAME);
	}
	const re = new Float32Array(CHROMA_FRAME);
	const im = new Float32Array(CHROMA_FRAME);
	const frames = Math.floor((mono.length - CHROMA_FRAME) / CHROMA_HOP) + 1;
	for (let t = 0; t < frames; t++) {
		const start = t * CHROMA_HOP;
		for (let i = 0; i < CHROMA_FRAME; i++) {
			re[i] = mono[start + i] * window[i];
			im[i] = 0;
		}
		fft(re, im);
		for (let b = 0; b < bins; b++) {
			if (binClass[b] >= 0) chroma[binClass[b]] += Math.hypot(re[b], im[b]);
		}
	}
}

/** Sums features of several stems into one (the mix's), padding onsets to the longest. */
export function combineFeatures(list: Features[]): Features | null {
	if (list.length === 0) return null;
	const fps = list[0].fps;
	const frames = Math.max(...list.map((f) => f.onset.length));
	const onset = new Float32Array(frames);
	const chroma = new Float32Array(12);
	for (const f of list) {
		for (let i = 0; i < f.onset.length; i++) onset[i] += f.onset[i];
		for (let c = 0; c < 12; c++) chroma[c] += f.chroma[c];
	}
	return { onset, fps, chroma };
}

/** Removes the slow trend from an onset envelope and rectifies it. */
function detrend(onset: Float32Array, fps: number): Float32Array {
	const out = new Float32Array(onset.length);
	const span = Math.max(1, Math.round(fps * 0.5));
	let sum = 0;
	for (let i = 0; i < onset.length; i++) {
		sum += onset[i];
		if (i >= span) sum -= onset[i - span];
		const mean = sum / Math.min(i + 1, span);
		out[i] = Math.max(0, onset[i] - mean);
	}
	return out;
}

function autocorrelation(x: Float32Array, lag: number): number {
	let s = 0;
	for (let i = lag; i < x.length; i++) s += x[i] * x[i - lag];
	return s / Math.max(1, x.length - lag);
}

/** Tempo in the 50–210 bpm range, preferring the octave nearest 110 bpm. */
export function detectTempo(onset: Float32Array, fps: number): Detection["tempo"] {
	const x = detrend(onset, fps);
	if (x.length < fps * 4) return { bpm: 0, confidence: 0 };
	const minLag = Math.floor((60 / 210) * fps);
	const maxLag = Math.ceil((60 / 50) * fps);
	const zero = autocorrelation(x, 0) || 1;
	const scores: number[] = [];
	let best = -1;
	let bestScore = -Infinity;
	for (let lag = minLag; lag <= maxLag; lag++) {
		const bpm = (60 * fps) / lag;
		// Log-normal prior around 110 bpm (Ellis 2007), gentle enough to keep real fast tempos.
		const prior = Math.exp(-0.5 * (Math.log2(bpm / 110) / 0.9) ** 2);
		const score = (autocorrelation(x, lag) / zero) * prior;
		scores[lag] = score;
		if (score > bestScore) {
			bestScore = score;
			best = lag;
		}
	}
	if (best < 0) return { bpm: 0, confidence: 0 };
	// Parabolic refinement of the peak lag.
	const l = scores[best - 1] ?? scores[best];
	const r = scores[best + 1] ?? scores[best];
	const denominator = l - 2 * scores[best] + r;
	const shift = denominator === 0 ? 0 : (0.5 * (l - r)) / denominator;
	const lag = best + Math.max(-0.5, Math.min(0.5, shift));
	const bpm = Math.round(((60 * fps) / lag) * 10) / 10;
	// Confidence: the peak against the mean score of the range.
	const values = scores.filter((v) => Number.isFinite(v));
	const mean = values.reduce((a, b) => a + b, 0) / values.length;
	const confidence = Math.max(0, Math.min(1, (bestScore - mean) / (bestScore || 1)));
	return { bpm, confidence };
}

/** 4/4 against 3/4: which grouping of beats the onsets repeat in. */
export function detectMeter(onset: Float32Array, fps: number, bpm: number): Detection["meter"] {
	if (!bpm) return { value: "4/4", confidence: 0 };
	// The raw envelope keeps the accent pattern the comparison relies on.
	const x = onset;
	const beat = (60 * fps) / bpm;
	const at = (beats: number) => {
		// Take the best lag within a small window, since the beat length is fractional.
		const centre = beat * beats;
		let best = 0;
		for (let lag = Math.floor(centre - 1); lag <= Math.ceil(centre + 1); lag++) {
			if (lag > 0 && lag < x.length) best = Math.max(best, autocorrelation(x, lag));
		}
		return best;
	};
	const four = at(4) + at(8);
	const three = at(3) + at(6);
	// 4/4 is the prior; 3/4 has to win, if only slightly.
	const value = three > four * 1.03 ? "3/4" : "4/4";
	const margin = Math.abs(three - four) / Math.max(three, four, 1e-9);
	return { value, confidence: Math.max(0, Math.min(1, margin)) };
}

// Krumhansl-Kessler key profiles, C major / C minor, rotated for the others.
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function correlation(a: ArrayLike<number>, b: number[], rotate: number): number {
	const n = 12;
	let ma = 0;
	let mb = 0;
	for (let i = 0; i < n; i++) {
		ma += a[i];
		mb += b[i];
	}
	ma /= n;
	mb /= n;
	let num = 0;
	let da = 0;
	let db = 0;
	for (let i = 0; i < n; i++) {
		const x = a[(i + rotate) % n] - ma;
		const y = b[i] - mb;
		num += x * y;
		da += x * x;
		db += y * y;
	}
	return da && db ? num / Math.sqrt(da * db) : 0;
}

/** The key whose profile the chroma matches best, e.g. "D major" or "B minor". */
export function detectKey(chroma: Float32Array): Detection["key"] {
	const total = chroma.reduce((a, b) => a + b, 0);
	if (total <= 0) return { value: "", confidence: 0 };
	const scores: { value: string; r: number }[] = [];
	for (let tonic = 0; tonic < 12; tonic++) {
		scores.push({ value: `${NOTE_NAMES[tonic]} major`, r: correlation(chroma, MAJOR, tonic) });
		scores.push({ value: `${NOTE_NAMES[tonic]} minor`, r: correlation(chroma, MINOR, tonic) });
	}
	scores.sort((a, b) => b.r - a.r);
	const [first, second] = scores;
	return { value: first.value, confidence: Math.max(0, Math.min(1, (first.r - second.r) * 4)) };
}

export function analyse(features: Features): Detection {
	const tempo = detectTempo(features.onset, features.fps);
	return {
		tempo,
		meter: detectMeter(features.onset, features.fps, tempo.bpm),
		key: detectKey(features.chroma),
	};
}
