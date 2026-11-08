import {
	ALIGNMENT_SOUND_FLOOR,
	ALIGNMENT_SOUND_WINDOW_SEC,
	ONSET_ENVELOPE_LEAD_SEC,
} from "#lib/constants/chartAlignment.js";
import { chartBarSeconds } from "#lib/utils/chartBarSeconds.js";
import type { ChartBar } from "#lib/utils/barmarkChartBars.js";
import { chordPitchClasses } from "#lib/utils/chordPitchClasses.js";
import { median } from "#lib/utils/median.js";
import { meterBeats } from "#lib/utils/meterBeats.js";
import { jointOnsetComb, rephaseGrid } from "./alignmentRepair.js";
import { fft, onsetEnvelope } from "./analysis.js";

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
 * million steps for a long song. The grid re-phase (stem-bench Study 27,
 * audio/alignmentRepair.ts) then puts the bar starts on the recording's
 * onset lattice: the bar from an onset comb, the phase line and its
 * trusted span from the path's middle (Study 26c), the whole line slid
 * within half a beat onto the onsets; the costs stay the path's.
 */
export interface Alignment {
	/**
	 * Seconds in the recording where each bar starts, plus where the last one
	 * ends: bars.length + 1. The re-phased starts when `repair` is set, else the path's.
	 */
	barStarts: number[];
	/** The warping path's own bar starts, before the grid re-phase (for diagnostics). */
	rawBarStarts: number[];
	/**
	 * The grid re-phase (stem-bench Study 27): the bar the line runs at, each
	 * start's confidence ("aligned" where the path's own start agrees within
	 * a quarter bar, else "re-phased"), the seconds the whole line slid onto
	 * the onsets and how many starts were re-phased. Null when it refused:
	 * the chart's bars do not line up with the recording through its middle
	 * (a wrong chart, on the bench).
	 */
	repair: {
		period: number;
		confidence: ("aligned" | "re-phased")[];
		delta: number;
		rephased: number;
	} | null;
	/** Mean step cost of the warping path (cosine distance, 0 to 1). */
	cost: number;
	/** The same with every chord a tritone away: what a wrong chart costs here. */
	controlCost: number;
	/** Per bar, the mean step cost over its frames: high where the chart stopped matching. */
	localCost: number[];
	/** Seconds per chroma frame. */
	hopSec: number;
	/** Seconds in the recording where the first audible window starts (`audibleSpan`); 0 when nothing is. */
	firstSound: number;
	/** Seconds in the recording where the last audible window ends; the recording's length when nothing is. */
	lastSound: number;
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
	const lengths = bars.map((b) => chartBarSeconds(b.meter, b.bpm));
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
 * Feature code: a change to what this computes bumps `af1` (utils/alignmentFeaturesKey.ts).
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
 * Where sound starts and ends in a recording (stem-bench Study 14's
 * FIRST-ONSET and LAST-SOUND anchors): the RMS of each
 * `ALIGNMENT_SOUND_WINDOW_SEC` window, and the first window's start and
 * the last window's end whose RMS reaches `ALIGNMENT_SOUND_FLOOR` of the
 * loudest one's. Accurate to a window. A silent recording gives 0 and its
 * length. Feature code: a change to what this computes bumps `af1`
 * (utils/alignmentFeaturesKey.ts).
 */
export function audibleSpan(
	samples: Float32Array,
	sampleRate: number,
): { first: number; last: number } {
	const size = Math.max(1, Math.round(ALIGNMENT_SOUND_WINDOW_SEC * sampleRate));
	const rms: number[] = [];
	for (let from = 0; from < samples.length; from += size) {
		const to = Math.min(samples.length, from + size);
		let sum = 0;
		for (let i = from; i < to; i++) sum += samples[i]! * samples[i]!;
		rms.push(Math.sqrt(sum / (to - from)));
	}
	const peak = rms.reduce((a, b) => Math.max(a, b), 0);
	const length = samples.length / sampleRate;
	if (peak <= 0) return { first: 0, last: length };
	const floor = ALIGNMENT_SOUND_FLOOR * peak;
	const first = rms.findIndex((v) => v >= floor);
	const last = rms.findLastIndex((v) => v >= floor);
	return {
		first: (first * size) / sampleRate,
		last: Math.min(length, ((last + 1) * size) / sampleRate),
	};
}

/**
 * The recording at about the bench's rate for its onsets: every `factor`
 * samples averaged, `factor` the whole number of times 22 050 Hz goes into
 * the rate (2 at 44.1 and 48 kHz, 1 below). Study 26c's onset envelopes
 * were read at 22 050 Hz, and the spectral flux at the full rate is half
 * the repair's time for nothing it uses.
 */
function onsetRate(recording: Float32Array, sampleRate: number) {
	const factor = Math.max(1, Math.floor(sampleRate / BENCH_RATE));
	if (factor === 1) return { samples: recording, rate: sampleRate };
	const samples = new Float32Array(Math.floor(recording.length / factor));
	for (let i = 0; i < samples.length; i++) {
		let sum = 0;
		for (let k = 0; k < factor; k++) sum += recording[i * factor + k]!;
		samples[i] = sum / factor;
	}
	return { samples, rate: sampleRate / factor };
}

/**
 * The recording's onset envelope as the grid re-phase reads it: decimated to
 * about 22 050 Hz (`onsetRate`), then `onsetEnvelope` (2048-sample window,
 * hop 256). Exported apart so a worker can run it beside the warping
 * (workers/alignmentEnvelope.worker.ts). Feature code: a change to what
 * this computes bumps `af1` (utils/alignmentFeaturesKey.ts).
 */
export function alignmentEnvelope(
	recording: Float32Array,
	sampleRate: number,
): { onset: Float32Array; fps: number } {
	const { samples, rate } = onsetRate(recording, sampleRate);
	return onsetEnvelope(samples, rate);
}

/**
 * The warping's alignment before the grid re-phase, with what the re-phase
 * needs: the chart's declared bar (the median over its bars, seconds) and
 * its beats a bar (the most common meter's numerator, `chartBeatsPerBar`).
 */
export interface AlignmentPath {
	alignment: Alignment;
	declaredBar: number;
	beatsPerBar: number;
}

/** The beats in the chart's most common meter (the first on a tie); four with no bars. */
function chartBeatsPerBar(bars: PadBar[]): number {
	const counts = new Map<string, number>();
	for (const b of bars) counts.set(b.meter, (counts.get(b.meter) ?? 0) + 1);
	let best: string | null = null;
	for (const [meter, count] of counts) if (best === null || count > counts.get(best)!) best = meter;
	return best === null ? 4 : meterBeats(best);
}

/**
 * What the alignment reads of the recording alone, apart from the chart
 * (cached per song in the browser, audio/alignmentFeaturesCache.ts): its
 * chromagram, the frames flattened 12 a frame, and where its sound starts
 * and ends (`audibleSpan`).
 */
export interface RecordingFeatures {
	chroma: Float32Array;
	frames: number;
	hopSec: number;
	firstSound: number;
	lastSound: number;
}

/** The recording's features (mono, at `sampleRate`): `chromagram` flattened and `audibleSpan`. */
export function recordingFeatures(recording: Float32Array, sampleRate: number): RecordingFeatures {
	const { frames, hopSec } = chromagram(recording, sampleRate);
	const chroma = new Float32Array(frames.length * 12);
	frames.forEach((f, i) => chroma.set(f, i * 12));
	const sound = audibleSpan(recording, sampleRate);
	return { chroma, frames: frames.length, hopSec, firstSound: sound.first, lastSound: sound.last };
}

/** The flattened chromagram as one 12-value view per frame, no copy. */
function chromaFrames(features: RecordingFeatures): Float32Array[] {
	return Array.from({ length: features.frames }, (_, i) =>
		features.chroma.subarray(i * 12, i * 12 + 12),
	);
}

/**
 * The chart's bars placed in the recording (mono, at `sampleRate`, or its
 * features from `recordingFeatures` at that rate) by the warping alone: the
 * path's cost, the tritone control's, each bar's local cost and where the
 * recording's sound starts and ends, with `repair` null and `barStarts` the
 * path's own. Throws with a reason a page can show when there is nothing to
 * align or the chart cannot fit (more than twice the recording's length, or
 * half), or when features came at another rate than the render's.
 */
export function alignChartPath(
	bars: PadBar[],
	recording: Float32Array | RecordingFeatures,
	sampleRate: number,
): AlignmentPath {
	if (bars.length === 0) throw new Error("The chart has no bars to place");
	const features = "chroma" in recording ? recording : recordingFeatures(recording, sampleRate);
	const { samples, barStarts } = renderChartPads(bars, sampleRate);
	const ref = chromagram(samples, sampleRate);
	const rec = chromaFrames(features);
	if (ref.frames.length === 0 || rec.length === 0)
		throw new Error("The recording or the chart is too short to align");
	if (ref.hopSec !== features.hopSec)
		throw new Error("The recording's features do not match its sample rate; place the chart again");
	if (ref.frames.length * rec.length > MAX_CELLS)
		throw new Error("The recording is too long to align in the browser");
	const right = dtwAlign(ref.frames, rec, ref.hopSec, { subsequence: true });
	if (!Number.isFinite(right.normalizedCost))
		throw new Error("The chart runs more than twice as long as the recording; check its tempo");
	const control = dtwAlign(tritone(ref.frames), rec, ref.hopSec, { subsequence: true });
	const rawBarStarts = barStarts.map(right.mapSeconds);
	return {
		alignment: {
			barStarts: rawBarStarts,
			rawBarStarts,
			repair: null,
			cost: right.normalizedCost,
			controlCost: control.normalizedCost,
			localCost: barCosts(barStarts, right.frameCost, ref.hopSec),
			hopSec: ref.hopSec,
			firstSound: features.firstSound,
			lastSound: features.lastSound,
		},
		declaredBar: median(bars.map((b) => chartBarSeconds(b.meter, b.bpm))),
		beatsPerBar: chartBeatsPerBar(bars),
	};
}

/**
 * The path's bar starts re-phased (audio/alignmentRepair.ts, stem-bench
 * Study 27) on the recording's onset envelope (`alignmentEnvelope`): the
 * onset comb near the chart's declared bar gives the period, and
 * `rephaseGrid` the starts, the whole line slid within half of one of the
 * chart's beats. The path's alignment unchanged when it refuses (`repair` null).
 */
export function repairAlignment(
	path: AlignmentPath,
	envelope: { onset: Float32Array; fps: number },
): Alignment {
	const { alignment, declaredBar, beatsPerBar } = path;
	const { onset, fps } = envelope;
	if (!(declaredBar > 0) || onset.length === 0) return alignment;
	const comb = jointOnsetComb(onset, fps, declaredBar);
	const rephased = rephaseGrid(alignment.rawBarStarts, onset, fps, comb.period, beatsPerBar);
	if (!rephased) return alignment;
	const { period, confidence, delta } = rephased;
	// The envelope reads onsets early (constants/chartAlignment.ts ONSET_ENVELOPE_LEAD_SEC); the lattice it names sits that much before the notes.
	const barStarts = rephased.barStarts.map((t) => t + ONSET_ENVELOPE_LEAD_SEC);
	const count = confidence.filter((c) => c === "re-phased").length;
	return { ...alignment, barStarts, repair: { period, confidence, delta, rephased: count } };
}

/**
 * The chart's bars placed in the recording with the grid re-phase:
 * `alignChartPath`, then `repairAlignment` on `alignmentEnvelope`. Throws
 * as `alignChartPath` does.
 */
export function alignChart(bars: PadBar[], recording: Float32Array, sampleRate: number): Alignment {
	return repairAlignment(
		alignChartPath(bars, recording, sampleRate),
		alignmentEnvelope(recording, sampleRate),
	);
}
