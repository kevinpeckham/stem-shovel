/**
 * Tempo, key and time-signature detection from decoded audio, in the browser,
 * at upload time. Deterministic signal processing, no model: an onset
 * strength envelope (spectral flux) autocorrelated for the tempo, beat
 * groupings compared for 4/4 against 3/4, and a chroma profile matched
 * against the Krumhansl-Kessler key templates. Features are extracted per
 * stem and summed, so a batch of stems is analyzed as one mix.
 */
import { TEMPO_LADDER_RUNGS } from "#lib/utils/tempoLadderMatch.js";

export interface Features {
	/** Onset strength per frame. */
	onset: Float32Array;
	/** Frames per second of `onset`. */
	fps: number;
	/** Energy per pitch class, C first. */
	chroma: Float32Array;
	/** The same for the bass (55–260 Hz), where the roots live; settles tonic against fifth. */
	bassChroma: Float32Array;
	/** 0..1: how much of the spectrum sits in peaks. Drums and noise are low, keys and bass high. */
	tonal: number;
	/** Each stem's own onset envelope when combined from several; the meter is decided per stem. */
	parts?: Float32Array[];
}

/** How the beat divides: 2 straight, 3 compound (6/8's running eighths, three to the dotted beat). */
export type Subdivision = 2 | 3;
/** Another rung of the tempo ladder: the same grid counted at a different level. */
export interface TempoRung {
	/** The rung's bpm over the detected one (2 = counted in eighths, 0.5 = in half notes, …). */
	factor: number;
	bpm: number;
	/** The autocorrelation at the rung's lag over the detected beat's, 0..1.5. */
	strength: number;
}
export interface Detection {
	tempo: { bpm: number; confidence: number; subdivision: Subdivision; alternates: TempoRung[] };
	meter: { value: "4/4" | "3/4" | "6/8"; confidence: number };
	key: { value: string; confidence: number };
}

const FRAME = 2048;
/** 125 onset frames per second: fine enough that the multi-beat refinement below lands within a fraction of a bpm. */
const HOP = 256;
/** Chroma needs finer bins than onsets: 8192 at 32 kHz is 3.9 Hz, under a semitone from 110 Hz up. */
const CHROMA_FRAME = 8192;
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
	const bassChroma = new Float32Array(12);
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
	const tonal = chromaOf(mono, sr, chroma, 110, 4200, CHROMA_FRAME);
	chromaOf(mono, sr, bassChroma, 55, 260, CHROMA_FRAME * 2);
	return { onset, fps: sr / HOP, chroma, bassChroma, tonal };
}

/**
 * Adds the pitch-class energy of `mono` between `lo` and `hi` Hz into `chroma`
 * and returns how tonal the band is (the share of its energy in peaks).
 * Only spectral peaks count (a bin louder than its two neighbors each side),
 * which drops the broadband smear of drums and noise, and each frame's
 * chroma is normalized before it is added, so a loud hit does not outweigh
 * a quiet bar. On MMKK's real mixes this took the key from 3 of 5 right to
 * 4 of 5, with wider margins.
 */
function chromaOf(
	mono: Float32Array,
	sr: number,
	chroma: Float32Array,
	lo: number,
	hi: number,
	frame: number,
): number {
	const hop = frame / 2;
	const bins = frame / 2;
	const binClass = new Int8Array(bins).fill(-1);
	for (let b = 1; b < bins; b++) {
		const f = (b * sr) / frame;
		if (f < lo || f > hi) continue;
		binClass[b] = (((Math.round(12 * Math.log2(f / 440)) + 9) % 12) + 12) % 12;
	}
	const window = new Float32Array(frame);
	for (let i = 0; i < frame; i++) {
		window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / frame);
	}
	const re = new Float32Array(frame);
	const im = new Float32Array(frame);
	const magnitude = new Float32Array(bins);
	const frameChroma = new Float32Array(12);
	const frames = Math.floor((mono.length - frame) / hop) + 1;
	let peakEnergy = 0;
	let bandEnergy = 0;
	for (let t = 0; t < frames; t++) {
		const start = t * hop;
		for (let i = 0; i < frame; i++) {
			re[i] = mono[start + i] * window[i];
			im[i] = 0;
		}
		fft(re, im);
		for (let b = 0; b < bins; b++) magnitude[b] = Math.hypot(re[b], im[b]);
		frameChroma.fill(0);
		for (let b = 2; b < bins - 2; b++) {
			if (binClass[b] < 0) continue;
			const m = magnitude[b];
			bandEnergy += m;
			if (
				m > magnitude[b - 1] &&
				m >= magnitude[b + 1] &&
				m > magnitude[b - 2] &&
				m > magnitude[b + 2]
			) {
				frameChroma[binClass[b]] += m;
				peakEnergy += m;
			}
		}
		const total = frameChroma.reduce((a, b) => a + b, 0);
		if (total > 0) for (let c = 0; c < 12; c++) chroma[c] += frameChroma[c] / total;
	}
	return bandEnergy > 0 ? peakEnergy / bandEnergy : 0;
}

/** Sums features of several stems into one (the mix's), padding onsets to the longest. */
export function combineFeatures(list: Features[]): Features | null {
	if (list.length === 0) return null;
	const fps = list[0].fps;
	const frames = Math.max(...list.map((f) => f.onset.length));
	const onset = new Float32Array(frames);
	const chroma = new Float32Array(12);
	const bassChroma = new Float32Array(12);
	// Every stem's onsets count (drums carry the beat); chroma is weighted by
	// how tonal a stem is, relative to the most tonal one, so drums, noise and
	// percussion drop out of the key without anyone naming them.
	const top = Math.max(...list.map((f) => f.tonal), 1e-9);
	let tonal = 0;
	for (const f of list) {
		for (let i = 0; i < f.onset.length; i++) onset[i] += f.onset[i];
		const w = (f.tonal / top) ** 2;
		for (let c = 0; c < 12; c++) {
			chroma[c] += f.chroma[c] * w;
			bassChroma[c] += f.bassChroma[c] * w;
		}
		tonal = Math.max(tonal, f.tonal);
	}
	return { onset, fps, chroma, bassChroma, tonal, parts: list.map((f) => f.onset) };
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

/** No tempo: silence, or too short to hold a pulse. */
const NO_TEMPO: Detection["tempo"] = { bpm: 0, confidence: 0, subdivision: 2, alternates: [] };

/**
 * Tempo in the 50–210 bpm range, preferring the octave nearest 110 bpm,
 * with how the beat divides (`subdivisionOf`) and the other rungs of the
 * ladder the same grid could be counted at (`tempoAlternates`).
 */
function detectTempo(onset: Float32Array, fps: number): Detection["tempo"] {
	const x = detrend(onset, fps);
	const pulse = findPulse(x, fps);
	if (!pulse) return NO_TEMPO;
	const { lag, subdivision } = subdivisionOf(x, pulse.lag);
	const bpm = Math.round(((60 * fps) / lag) * 10) / 10;
	return {
		bpm,
		confidence: pulse.confidence,
		subdivision,
		alternates: tempoAlternates(x, lag, bpm),
	};
}

/** The beat's lag in frames (refined, fractional) and how clearly it stands out, or null. */
function findPulse(x: Float32Array, fps: number): { lag: number; confidence: number } | null {
	if (x.length < fps * 4 || autocorrelation(x, 0) <= 0) return null;
	const minLag = Math.floor((60 / 210) * fps);
	const maxLag = Math.ceil((60 / 50) * fps);
	const zero = autocorrelation(x, 0);
	const scores: number[] = [];
	let best = -1;
	let bestScore = -Infinity;
	for (let lag = minLag; lag <= maxLag; lag++) {
		const bpm = (60 * fps) / lag;
		// Octave choice: band music mostly sits in 80–170 bpm, and the half- or
		// double-time lag often correlates as well as the beat, so candidates
		// outside that band are held back and a gentle log-normal around 120
		// breaks the rest (tuned on the real mixes in MMKK: 145, 132, 120, 115
		// and 112 bpm songs all resolve to the declared tempo).
		const inBand = bpm >= 80 && bpm <= 170 ? 1 : 0.55;
		const prior = inBand * Math.exp(-0.5 * (Math.log2(bpm / 120) / 1.2) ** 2);
		const score = (autocorrelation(x, lag) / zero) * prior;
		scores[lag] = score;
		if (score > bestScore) {
			bestScore = score;
			best = lag;
		}
	}
	if (best < 0) return null;
	// Parabolic refinement of the peak lag, then a sharper measure: the
	// autocorrelation peak at k beats sits at k times the period, so its
	// position pins the period to 1/k of a frame. Take the longest span that
	// still peaks clearly (the envelope must hold the pulse that long).
	const lag = refinePeriod(x, refineLag(scores, best));
	// Confidence: the peak against the mean score of the range.
	const values = scores.filter((v) => Number.isFinite(v));
	const mean = values.reduce((a, b) => a + b, 0) / values.length;
	const confidence = Math.max(0, Math.min(1, (bestScore - mean) / (bestScore || 1)));
	return { lag, confidence };
}

/** The autocorrelation's best value within a frame of a fractional lag (0 outside the envelope). */
function acNear(x: Float32Array, centre: number): number {
	let best = 0;
	for (let lag = Math.floor(centre - 1); lag <= Math.ceil(centre + 1); lag++) {
		if (lag > 0 && lag < x.length) best = Math.max(best, autocorrelation(x, lag));
	}
	return best;
}

// Subdivision thresholds. The plan's starting points (docs/tempo-grid-plan.md)
// were 1.15 for both margins; the synthetic fixtures in analysis.test.ts
// moved the super-beat one. The onset envelope is log-compressed spectral
// flux, which flattens accents: a 6/8 whose dotted beats are four times
// louder than its other eighths reads only 1.02–1.12 at three eighths
// against four, while straight eighths can never exceed 1 (ab ≤ (a² + b²)/2;
// 0.91–0.97 measured).
/** The third-of-a-beat lag must beat the half-beat lag by this much (sub-beat test). */
const COMPOUND_MARGIN = 1.15;
/** The dotted-beat lag must beat the two-beat lag by this much (super-beat test): above straight's ceiling of 1. */
const DOTTED_MARGIN = 1.05;
/**
 * And the third-of-a-beat lag must carry this share of the beat's own:
 * running triplets pair every onset with the next (6/8 with 3+3 accents
 * scores 0.6–1), a swung beat pairs only the late off-beat with the next
 * downbeat (at most 0.5, at equal loudness). This replaces the plan's
 * second clause, ac(L/3) ≥ 0.8·ac(2L/3), which an envelope periodic in L
 * always passes: ac(τ) = ac(L − τ), so swing scores the two alike.
 */
const TRIPLET_SHARE = 0.55;
/** The dotted-beat lag must carry this share of the beat's, so two near-silent lags decide nothing. */
const DOTTED_FLOOR = 0.2;

/**
 * Straight or compound, and the beat lag to keep. Two tests, both on the
 * autocorrelation at lags around the detected beat L:
 * - sub-beat: the beat splits in three (ac at L/3 beats L/2, and running
 *   triplets fill it): the detector found the dotted beat, keep it;
 * - super-beat: groups of three of half the beat (ac at 1.5 L beats 2 L):
 *   the detector took two eighths of a 6/8 for the beat (1.5× the true
 *   tempo, every 6/8 item on the bench), so the dotted beat, 1.5 L, is
 *   re-picked as the pulse.
 */
function subdivisionOf(x: Float32Array, lag: number): { lag: number; subdivision: Subdivision } {
	const beat = acNear(x, lag);
	const third = acNear(x, lag / 3);
	if (third > COMPOUND_MARGIN * acNear(x, lag / 2) && third >= TRIPLET_SHARE * beat) {
		return { lag, subdivision: 3 };
	}
	const dotted = acNear(x, lag * 1.5);
	if (dotted > DOTTED_MARGIN * acNear(x, lag * 2) && dotted >= DOTTED_FLOOR * beat) {
		return { lag: refinePeriod(x, lag * 1.5), subdivision: 3 };
	}
	return { lag, subdivision: 2 };
}

/** Each rung with the autocorrelation at its lag over the beat's, strongest first. */
function tempoAlternates(x: Float32Array, lag: number, bpm: number): TempoRung[] {
	const beat = acNear(x, lag);
	if (beat <= 0) return [];
	return TEMPO_LADDER_RUNGS.filter((factor) => lag / factor >= 2 && lag / factor < x.length)
		.map((factor) => ({
			factor,
			bpm: Math.round(bpm * factor * 10) / 10,
			strength: Math.round(Math.max(0, Math.min(1.5, acNear(x, lag / factor) / beat)) * 100) / 100,
		}))
		.sort((a, b) => b.strength - a.strength);
}

function refineLag(scores: number[], best: number): number {
	const l = scores[best - 1] ?? scores[best];
	const r = scores[best + 1] ?? scores[best];
	const denominator = l - 2 * scores[best] + r;
	const shift = denominator === 0 ? 0 : (0.5 * (l - r)) / denominator;
	return best + Math.max(-0.5, Math.min(0.5, shift));
}

function refinePeriod(x: Float32Array, period: number): number {
	const base = autocorrelation(x, Math.round(period));
	let refined = period;
	for (const k of [2, 4, 8, 16, 32]) {
		const centre = refined * k;
		const window = Math.max(2, Math.round(period / 4));
		if (centre + window >= x.length / 2) break;
		let bestLag = -1;
		let bestValue = -Infinity;
		const values: number[] = [];
		for (let lag = Math.round(centre - window); lag <= Math.round(centre + window); lag++) {
			const v = autocorrelation(x, lag);
			values[lag] = v;
			if (v > bestValue) {
				bestValue = v;
				bestLag = lag;
			}
		}
		// A peak at the edge of the window or a faint one means the pulse has drifted; stop here.
		if (bestLag < 0 || bestValue < base * 0.35) break;
		if (bestLag <= Math.round(centre - window) || bestLag >= Math.round(centre + window)) break;
		refined = refineLag(values, bestLag) / k;
	}
	return refined;
}

/**
 * How much an onset envelope prefers groups of three beats over four:
 * positive leans 3/4, negative 4/4, near zero says nothing (a four-on-the-
 * floor kick repeats the same at every lag).
 */
function meterLean(x: Float32Array, fps: number, bpm: number): number {
	const beat = (60 * fps) / bpm;
	// The best lag within a small window, since the beat length is fractional.
	const at = (beats: number) => acNear(x, beat * beats);
	const four = at(4) + at(8);
	const three = at(3) + at(6);
	return (three - four) / Math.max(three, four, 1e-9);
}

/**
 * 4/4 against 3/4, and 6/8 when the beat divides in three. With several stems each votes with its own envelope,
 * weighted by how decisive it is: a kick that repeats every beat says
 * nothing, a hat or bass with a clear four-beat pattern says a lot, and one
 * riff with a three-feel cannot outvote them — which is what happened when
 * the summed envelope alone decided. 4/4 is the prior: 3/4 needs a clear
 * lean. The confidence is the size of the agreed lean. A compound beat
 * (subdivision 3) is always 6/8, two dotted beats to the bar, the only
 * compound meter emitted; the grouping vote's confidence stays.
 */
function detectMeter(
	onset: Float32Array,
	fps: number,
	tempo: Pick<Detection["tempo"], "bpm" | "subdivision">,
	parts?: Float32Array[],
): Detection["meter"] {
	const { bpm, subdivision } = tempo;
	if (!bpm) return { value: "4/4", confidence: 0 };
	const envelopes = parts && parts.length > 1 ? parts : [onset];
	let total = 0;
	let weight = 0;
	for (const x of envelopes) {
		const lean = meterLean(x, fps, bpm);
		total += lean * Math.abs(lean);
		weight += Math.abs(lean);
	}
	const lean = weight > 0 ? total / weight : 0;
	const value = subdivision === 3 ? "6/8" : lean > 0.03 ? "3/4" : "4/4";
	return { value, confidence: Math.max(0, Math.min(1, Math.abs(lean))) };
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

/**
 * The key whose profile the chroma matches best, e.g. "D major" or "B minor".
 * The profiles often rank a key and its fifth (D and G, C and G) almost
 * level; when the two best differ in tonic, the bass decides, since the
 * roots live there (D major songs sit on D in the bass, not G).
 */
export function detectKey(chroma: Float32Array, bassChroma?: Float32Array): Detection["key"] {
	const total = chroma.reduce((a, b) => a + b, 0);
	if (total <= 0) return { value: "", confidence: 0 };
	const scores: { value: string; tonic: number; r: number }[] = [];
	for (let tonic = 0; tonic < 12; tonic++) {
		scores.push({
			value: `${NOTE_NAMES[tonic]} major`,
			tonic,
			r: correlation(chroma, MAJOR, tonic),
		});
		scores.push({
			value: `${NOTE_NAMES[tonic]} minor`,
			tonic,
			r: correlation(chroma, MINOR, tonic),
		});
	}
	scores.sort((a, b) => b.r - a.r);
	let [first, second] = scores;
	const bassTotal = bassChroma?.reduce((a, b) => a + b, 0) ?? 0;
	if (bassChroma && bassTotal > 0 && first.tonic !== second.tonic && first.r - second.r < 0.15) {
		if (bassChroma[second.tonic] > bassChroma[first.tonic] * 1.1) [first, second] = [second, first];
	}
	return { value: first.value, confidence: Math.max(0, Math.min(1, (first.r - second.r) * 4)) };
}

/** The chroma of one stretch of a song, for a key of its own (docs/audio-engine.md, "Several keys"). */
export interface KeySegment {
	/** Seconds. */
	start: number;
	chroma: Float32Array;
	bassChroma: Float32Array;
}

/**
 * Chroma per stretch of the whole buffer, the stretches starting at
 * `boundaries` (seconds, the first at 0: the song's sections, or windows
 * where it has none), so each can have a key of its own. The whole
 * length, not the first 90 s the tempo looks at.
 */
export function extractKeySegments(buffer: AudioBuffer, boundaries: number[]): KeySegment[] {
	const sr = buffer.sampleRate;
	const mono = new Float32Array(buffer.length);
	for (let c = 0; c < buffer.numberOfChannels; c++) {
		const data = buffer.getChannelData(c);
		for (let i = 0; i < buffer.length; i++) mono[i] += data[i] / buffer.numberOfChannels;
	}
	const starts = [...new Set([0, ...boundaries])].sort((a, b) => a - b);
	return starts.map((start, i) => {
		const from = Math.min(mono.length, Math.max(0, Math.floor(start * sr)));
		const to =
			i + 1 < starts.length ? Math.min(mono.length, Math.floor(starts[i + 1]! * sr)) : mono.length;
		const slice = mono.subarray(from, to);
		const chroma = new Float32Array(12);
		const bassChroma = new Float32Array(12);
		if (slice.length >= CHROMA_FRAME * 2) {
			chromaOf(slice, sr, chroma, 110, 4200, CHROMA_FRAME);
			chromaOf(slice, sr, bassChroma, 55, 260, CHROMA_FRAME * 2);
		}
		return { start, chroma, bassChroma };
	});
}

/** Sums several stems' segments (the same boundaries) into one set, the mix's. */
export function combineKeySegments(list: KeySegment[][]): KeySegment[] {
	const first = list[0];
	if (!first) return [];
	return first.map((seg, i) => {
		const chroma = new Float32Array(12);
		const bassChroma = new Float32Array(12);
		for (const stem of list) {
			const s = stem[i];
			if (!s) continue;
			for (let c = 0; c < 12; c++) {
				chroma[c] += s.chroma[c]!;
				bassChroma[c] += s.bassChroma[c]!;
			}
		}
		return { start: seg.start, chroma, bassChroma };
	});
}

export interface KeyChange {
	start: number;
	value: string;
	confidence: number;
}

/** Every key's score for a chroma: the profile correlation, lifted a little where the bass sits on the tonic (as detectKey's tiebreak does). */
export function keyScores(chroma: Float32Array, bassChroma?: Float32Array): number[] {
	const total = chroma.reduce((a, b) => a + b, 0);
	const bassTotal = bassChroma?.reduce((a, b) => a + b, 0) ?? 0;
	const scores: number[] = [];
	for (let tonic = 0; tonic < 12; tonic++) {
		const bass = bassChroma && bassTotal > 0 ? (0.15 * bassChroma[tonic]!) / bassTotal : 0;
		scores.push(total > 0 ? correlation(chroma, MAJOR, tonic) + bass : 0);
		scores.push(total > 0 ? correlation(chroma, MINOR, tonic) + bass : 0);
	}
	return scores;
}
const KEY_NAMES = Array.from({ length: 24 }, (_, i) =>
	i % 2 === 0 ? `${NOTE_NAMES[i / 2]} major` : `${NOTE_NAMES[(i - 1) / 2]} minor`,
);

/**
 * A key per stretch, as changes, by the path through the 24 keys that
 * scores best over all the segments with a cost for every switch
 * (Viterbi): a segment on its own may lean to a neighbor key (the
 * relative, the fifth), and a stretch where the chroma says little takes
 * the key around it rather than a key of its own, so what comes out is
 * the few keys the song really moves through, each from where it begins.
 * `penalty` is in units of the profile correlation (0.35 keeps a
 * two-window switch only when it is clear). A song in one key comes back
 * as one change at 0.
 */
export function detectKeys(segments: KeySegment[], penalty = 0.35): KeyChange[] {
	const n = segments.length;
	if (n === 0) return [];
	const scores = segments.map((s) => keyScores(s.chroma, s.bassChroma));
	// Silent or near-empty segments score 0 everywhere: they take the path's key for free.
	const best = Array.from({ length: 24 }, () => 0);
	const from: number[][] = [];
	for (let t = 0; t < n; t++) {
		const row = scores[t]!;
		const next = Array.from({ length: 24 }, () => 0);
		const back = Array.from({ length: 24 }, () => 0);
		let top = 0;
		for (let k = 0; k < 24; k++) if (best[k]! > best[top]!) top = k;
		for (let k = 0; k < 24; k++) {
			const stay = best[k]!;
			const jump = best[top]! - penalty;
			if (t === 0 || stay >= jump) {
				next[k] = (t === 0 ? 0 : stay) + row[k]!;
				back[k] = k;
			} else {
				next[k] = jump + row[k]!;
				back[k] = top;
			}
		}
		from.push(back);
		for (let k = 0; k < 24; k++) best[k] = next[k]!;
	}
	let k = 0;
	for (let i = 0; i < 24; i++) if (best[i]! > best[k]!) k = i;
	const path = Array.from({ length: n }, () => 0);
	for (let t = n - 1; t >= 0; t--) {
		path[t] = k;
		k = from[t]![k]!;
	}
	const out: KeyChange[] = [];
	for (let t = 0; t < n; t++) {
		const key = path[t]!;
		if (out.length && out.at(-1)!.value === KEY_NAMES[key]) continue;
		const row = scores[t]!;
		const sorted = [...row].sort((a, b) => b - a);
		const margin = Math.max(
			0,
			Math.min(1, (row[key]! - (sorted[0] === row[key] ? sorted[1]! : sorted[0]!)) * 4),
		);
		out.push({ start: segments[t]!.start, value: KEY_NAMES[key]!, confidence: margin });
	}
	return out;
}

export function analyse(features: Features): Detection {
	const tempo = detectTempo(features.onset, features.fps);
	return {
		tempo,
		meter: detectMeter(features.onset, features.fps, tempo, features.parts),
		key: detectKey(features.chroma, features.bassChroma),
	};
}
