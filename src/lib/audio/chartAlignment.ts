import type { ChartBar } from "#lib/utils/chartBars.js";
import { chordPitchClasses } from "#lib/utils/chordPitchClasses.js";
import { fft } from "./analysis.js";

/**
 * A chart's bars placed in seconds in a recording, with no model
 * (stem-bench Study 12, FINDINGS.md "Study 12 verdict"): the chart is
 * rendered as plain chord pads at its declared tempo and meter, both the
 * render and the recording become chromagrams, and dynamic time warping
 * maps one onto the other, so every bar start of the render, known by
 * construction, lands at a time in the recording. On the bench that put
 * 95 % of bar starts within ±0.25 s and every section boundary within
 * ±0.5 s; the first and last boundaries are the weak ones (the chart stops
 * describing the intro and the outro tail). The same alignment with the
 * chart transposed a tritone is the control: a recording of this chart
 * fits the right chart far better (a wrong chart's path cost ran 8.6 to
 * 16.3 times the right one's). The math is the bench's (`study12/`
 * chroma, dtw, reference), ported; it runs in a worker
 * (workers/alignChart.worker.ts) because the warping is a few hundred
 * million steps for a long song.
 */
export interface Alignment {
	/** Seconds in the recording where each bar starts, plus where the last one ends: bars.length + 1. */
	barStarts: number[];
	/** Mean step cost of the warping path (cosine distance, 0 to 1). */
	cost: number;
	/** The same with every chord a tritone away: what a wrong chart costs here. */
	controlCost: number;
	/** Per bar, the mean step cost over its frames: high where the chart stopped matching. */
	localCost: number[];
	/** Seconds per chroma frame. */
	hopSec: number;
}

type PadBar = Pick<ChartBar, "chords" | "bpm" | "meter">;

/** The bench's chroma window, 4096 samples at 22 050 Hz (≈ 0.186 s); the hop is half of it. */
const BENCH_RATE = 22050;
const BENCH_WINDOW = 4096;
const LOW_HZ = 55;
const HIGH_HZ = 2200;
/** The warping's step table is a byte a cell: past this (a song of about 17 minutes) it is not worth the memory. */
const MAX_CELLS = 150_000_000;
const NO_CHORD = /^n\.?c\.?$/i;

/**
 * Seconds in a bar: the numerator's beats at the bpm, where a beat is the
 * meter's bottom note, as the song's changes count it everywhere
 * (`audio/measures.ts`: 6/8 at 120 is 120 eighths a minute, three seconds
 * a bar). The bench's `barSeconds` counted a compound meter's dotted beat
 * instead; the chart's defaults come from the song's changes, so the
 * app's rule holds here, or a 6/8 song would render three times too
 * short and fall outside the warp's slopes.
 */
function barSeconds(meter: string, bpm: number): number {
	const top = Number(/^\s*(\d+)\s*\//.exec(meter)?.[1] ?? 4) || 4;
	return (top * 60) / bpm;
}

const midiHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** One chord as a sustained pad: the root two octaves under middle C, the chord's tones above it, each a sine and a soft octave. */
function addPad(
	out: Float32Array,
	sampleRate: number,
	startSec: number,
	durSec: number,
	chord: { root: number; tones: number[] },
): void {
	const from = Math.max(0, Math.floor(startSec * sampleRate));
	const to = Math.min(out.length, Math.floor((startSec + durSec) * sampleRate));
	const attack = Math.max(1, 0.02 * sampleRate);
	const tones = [
		36 + chord.root,
		...chord.tones.map((pc) => 60 + chord.root + ((pc - chord.root + 12) % 12)),
	];
	for (const midi of tones) {
		// A rotating phasor instead of a sine per sample: the same wave, a fraction of the cost.
		const w = (2 * Math.PI * midiHz(midi)) / sampleRate;
		const [dc, ds] = [Math.cos(w), Math.sin(w)];
		let [c, s] = [Math.cos(w * from), Math.sin(w * from)];
		for (let i = from; i < to; i++) {
			const n = i - from;
			const env = (n < attack ? n / attack : 1) * 0.25;
			out[i]! += (s + 0.5 * s * c) * env;
			[c, s] = [c * dc - s * ds, s * dc + c * ds];
		}
	}
}

/** What each slot of a bar sounds: its chord, null for N.C.; an unreadable symbol holds what came before. */
function slotsOf(bar: PadBar, held: ReturnType<typeof chordPitchClasses>) {
	if (bar.chords.length === 0) return [held];
	const slots: ReturnType<typeof chordPitchClasses>[] = [];
	for (const symbol of bar.chords) {
		held = NO_CHORD.test(symbol.trim()) ? null : (chordPitchClasses(symbol) ?? held);
		slots.push(held);
	}
	return slots;
}

/**
 * The chart as audio, badly but in time (the bench's `renderReference`):
 * each bar's chords as pads at the declared tempo and meter, two or more
 * chords splitting the bar evenly, a held bar continuing the chord before
 * it, N.C. silent. Peak-normalized. `barStarts` has bars.length + 1
 * entries, the last the render's end.
 */
export function renderChartPads(
	bars: PadBar[],
	sampleRate: number,
): { samples: Float32Array; barStarts: number[] } {
	const lengths = bars.map((b) => barSeconds(b.meter, b.bpm));
	const samples = new Float32Array(Math.ceil(lengths.reduce((a, b) => a + b, 0) * sampleRate));
	const barStarts: number[] = [];
	let at = 0;
	let held: ReturnType<typeof chordPitchClasses> = null;
	for (const [i, bar] of bars.entries()) {
		barStarts.push(at);
		const slots = slotsOf(bar, held);
		const slot = lengths[i]! / slots.length;
		for (const [k, chord] of slots.entries())
			if (chord) addPad(samples, sampleRate, at + k * slot, slot, chord);
		held = slots.at(-1) ?? null;
		at += lengths[i]!;
	}
	barStarts.push(at);
	let peak = 0;
	for (const v of samples) peak = Math.max(peak, Math.abs(v));
	if (peak > 0) for (let i = 0; i < samples.length; i++) samples[i]! /= peak;
	return { samples, barStarts };
}

/** The window at a rate: the bench's length in seconds, rounded to the nearest power of two (in octaves). */
function chromaWindow(sampleRate: number): number {
	return 2 ** Math.round(Math.log2((BENCH_WINDOW * sampleRate) / BENCH_RATE));
}

/**
 * Twelve pitch-class energies per frame (the bench's `chromagram`): a Hann
 * window of about 0.19 s, hop half that, spectrum magnitudes from 55 to
 * 2200 Hz folded to the nearest pitch class, each frame L2-normalized (a
 * silent frame stays zero). The window is the bench's in seconds at any
 * rate, so a render and a recording at the same rate share `hopSec`.
 */
export function chromagram(
	samples: Float32Array,
	sampleRate: number,
): { frames: Float32Array[]; hopSec: number } {
	const win = chromaWindow(sampleRate);
	const hop = win / 2;
	const re = new Float32Array(win);
	const im = new Float32Array(win);
	const hann = new Float32Array(win);
	for (let i = 0; i < win; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / win);
	const minBin = Math.max(1, Math.floor((LOW_HZ * win) / sampleRate));
	const maxBin = Math.min(win / 2 - 1, Math.ceil((HIGH_HZ * win) / sampleRate));
	const pcOf = new Int8Array(maxBin + 1);
	for (let bin = minBin; bin <= maxBin; bin++) {
		const midi = 69 + 12 * Math.log2((bin * sampleRate) / win / 440);
		pcOf[bin] = ((Math.round(midi) % 12) + 12) % 12;
	}
	const frames: Float32Array[] = [];
	for (let start = 0; start + win <= samples.length; start += hop) {
		for (let i = 0; i < win; i++) {
			re[i] = samples[start + i]! * hann[i]!;
			im[i] = 0;
		}
		fft(re, im);
		const chroma = new Float32Array(12);
		for (let bin = minBin; bin <= maxBin; bin++)
			chroma[pcOf[bin]!]! += Math.hypot(re[bin]!, im[bin]!);
		const norm = Math.hypot(...chroma);
		if (norm > 1e-9) for (let c = 0; c < 12; c++) chroma[c]! /= norm;
		frames.push(chroma);
	}
	return { frames, hopSec: hop / sampleRate };
}

const isZero = (f: Float32Array) => f.every((v) => Math.abs(v) < 1e-6);

/** Cosine distance of normalized frames; a zero frame is as far as can be from all but another zero frame. */
function distance(a: Float32Array, b: Float32Array, aZero: boolean, bZero: boolean): number {
	if (aZero || bZero) return aZero && bZero ? 0 : 1;
	let dot = 0;
	for (let i = 0; i < 12; i++) dot += a[i]! * b[i]!;
	return 1 - dot;
}

export interface DtwResult {
	/** The path as [reference frame, recording frame] pairs, start to end. */
	path: [number, number][];
	/** Mean step cost along the path. */
	normalizedCost: number;
	/** Reference seconds to recording seconds, linear between the path's points. */
	mapSeconds: (refSec: number) => number;
	/** Per reference frame, the mean step cost of the path's points on it (a frame the path steps over takes the one before). */
	frameCost: Float32Array;
}

interface Table {
	steps: Uint8Array;
	last: Float64Array;
}

/** Rows of cumulative cost: this one, the one before and the one before that. */
interface Rows {
	cur: Float64Array;
	prev: Float64Array;
	older: Float64Array;
}

/** Row `i` of the table: each cell the cheapest of its three predecessors plus its own distance; the step taken goes in `steps`. */
function fillRow(i: number, rows: Rows, steps: Uint8Array, cost: (j: number) => number): void {
	const { cur, prev, older } = rows;
	const m = cur.length - 1;
	cur[0] = Infinity;
	for (let j = 1; j <= m; j++) {
		const d12 = j >= 2 ? prev[j - 2]! : Infinity;
		const d21 = i >= 2 ? older[j - 1]! : Infinity;
		let [best, step] = [prev[j - 1]!, 1];
		if (d12 < best) [best, step] = [d12, 2];
		if (d21 < best) [best, step] = [d21, 3];
		cur[j] = best + cost(j - 1);
		steps[i * (m + 1) + j] = step;
	}
}

/** The cumulative costs, two rows behind at a time, and every cell's step: 1 diagonal, 2 the reference slower, 3 faster. */
function fillTable(
	ref: Float32Array[],
	rec: Float32Array[],
	refZero: boolean[],
	recZero: boolean[],
	subsequence: boolean,
): Table {
	const [n, m] = [ref.length, rec.length];
	const steps = new Uint8Array((n + 1) * (m + 1));
	let rows: Rows = {
		cur: new Float64Array(m + 1),
		prev: new Float64Array(m + 1).fill(subsequence ? 0 : Infinity),
		older: new Float64Array(m + 1).fill(Infinity),
	};
	rows.prev[0] = 0;
	for (let i = 1; i <= n; i++) {
		const [a, aZero] = [ref[i - 1]!, refZero[i - 1]!];
		fillRow(i, rows, steps, (j) => distance(a, rec[j]!, aZero, recZero[j]!));
		rows = { cur: rows.older, prev: rows.cur, older: rows.prev };
	}
	return { steps, last: rows.prev };
}

function backtrack(steps: Uint8Array, n: number, m: number, endJ: number, subsequence: boolean) {
	const path: [number, number][] = [];
	let [i, j] = [n, endJ];
	while (i >= 1 && j >= 1) {
		path.push([i - 1, j - 1]);
		const s = steps[i * (m + 1) + j];
		if (s === 2) [i, j] = [i - 1, j - 2];
		else if (s === 3) [i, j] = [i - 2, j - 1];
		else [i, j] = [i - 1, j - 1];
		if (subsequence && i === 0) break;
	}
	return path.reverse();
}

function mapperOf(path: [number, number][], hopSec: number): (refSec: number) => number {
	const knotsRef = path.map(([r]) => r * hopSec);
	const knotsRec = path.map(([, c]) => c * hopSec);
	return (refSec) => {
		if (path.length === 0) return refSec;
		if (refSec <= knotsRef[0]!) return knotsRec[0]! + (refSec - knotsRef[0]!);
		for (let k = 1; k < knotsRef.length; k++) {
			if (refSec <= knotsRef[k]!) {
				const span = knotsRef[k]! - knotsRef[k - 1]!;
				const t = span > 1e-9 ? (refSec - knotsRef[k - 1]!) / span : 0;
				return knotsRec[k - 1]! + t * (knotsRec[k]! - knotsRec[k - 1]!);
			}
		}
		return knotsRec.at(-1)! + (refSec - knotsRef.at(-1)!);
	};
}

function frameCostOf(path: [number, number][], n: number, cost: (r: number, c: number) => number) {
	const sum = new Float32Array(n);
	const count = new Uint16Array(n);
	for (const [r, c] of path) {
		sum[r]! += cost(r, c);
		count[r]!++;
	}
	const out = new Float32Array(n);
	for (let r = 0; r < n; r++) out[r] = count[r] ? sum[r]! / count[r]! : r > 0 ? out[r - 1]! : 0;
	return out;
}

/**
 * Dynamic time warping over chroma (the bench's `dtwAlign`): cosine
 * distance, steps (1,1), (1,2) and (2,1), so the reference never stalls
 * and a bar cannot map to no time (and the recording can run at half to
 * twice the chart's tempo). `subsequence` frees the recording's start and
 * end (a count-in, a tail). A path that cannot fit costs Infinity.
 */
export function dtwAlign(
	ref: Float32Array[],
	rec: Float32Array[],
	hopSec: number,
	opts: { subsequence?: boolean } = {},
): DtwResult {
	const [n, m] = [ref.length, rec.length];
	const subsequence = opts.subsequence ?? false;
	const refZero = ref.map(isZero);
	const recZero = rec.map(isZero);
	const { steps, last } = fillTable(ref, rec, refZero, recZero, subsequence);
	let endJ = m;
	if (subsequence) for (let j = 1; j <= m; j++) if (last[j]! < last[endJ]!) endJ = j;
	const path = backtrack(steps, n, m, endJ, subsequence);
	const cost = (r: number, c: number) => distance(ref[r]!, rec[c]!, refZero[r]!, recZero[c]!);
	return {
		path,
		normalizedCost: last[endJ]! / Math.max(1, path.length),
		mapSeconds: mapperOf(path, hopSec),
		frameCost: frameCostOf(path, n, cost),
	};
}

/** The frames a tritone away: the chart with every chord transposed six semitones, for chroma's purposes. */
const tritone = (frames: Float32Array[]) =>
	frames.map((f) => Float32Array.from({ length: 12 }, (_, pc) => f[(pc + 6) % 12]!));

function barCosts(starts: number[], frameCost: Float32Array, hopSec: number): number[] {
	return starts.slice(0, -1).map((start, b) => {
		const from = Math.ceil(start / hopSec);
		const to = Math.min(frameCost.length, Math.ceil(starts[b + 1]! / hopSec));
		if (to <= from)
			return frameCost[Math.min(frameCost.length - 1, Math.round(start / hopSec))] ?? 0;
		let sum = 0;
		for (let k = from; k < to; k++) sum += frameCost[k]!;
		return sum / (to - from);
	});
}

/**
 * The chart's bars placed in the recording (mono, at `sampleRate`), with
 * the path's cost, the tritone control's and each bar's local cost.
 * Throws with a reason a page can show when there is nothing to align or
 * the chart cannot fit (more than twice the recording's length, or half).
 */
export function alignChart(bars: PadBar[], recording: Float32Array, sampleRate: number): Alignment {
	if (bars.length === 0) throw new Error("The chart has no bars to place");
	const { samples, barStarts } = renderChartPads(bars, sampleRate);
	const ref = chromagram(samples, sampleRate);
	const rec = chromagram(recording, sampleRate);
	if (ref.frames.length === 0 || rec.frames.length === 0)
		throw new Error("The recording or the chart is too short to align");
	if (ref.frames.length * rec.frames.length > MAX_CELLS)
		throw new Error("The recording is too long to align in the browser");
	const right = dtwAlign(ref.frames, rec.frames, ref.hopSec, { subsequence: true });
	if (!Number.isFinite(right.normalizedCost))
		throw new Error("The chart runs more than twice as long as the recording; check its tempo");
	const control = dtwAlign(tritone(ref.frames), rec.frames, ref.hopSec, { subsequence: true });
	return {
		barStarts: barStarts.map(right.mapSeconds),
		cost: right.normalizedCost,
		controlCost: control.normalizedCost,
		localCost: barCosts(barStarts, right.frameCost, ref.hopSec),
		hopSec: ref.hopSec,
	};
}
