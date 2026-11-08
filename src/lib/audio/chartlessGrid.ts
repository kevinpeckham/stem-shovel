import {
	DOWNBEAT_MIN_SCORE,
	DOWNBEAT_OFF_COMB_MARGIN,
	DOWNBEAT_WEIGHTS,
	HARMONIC_ALONE_MIN_RATIO,
	ONSET_ENVELOPE_LEAD_SEC,
	PLACEMENT_FIRST_SOUND_SLACK_BEATS,
	SECTION_NOVELTY_SPANS,
	TIME_ZERO_SNAP_BEATS,
} from "#lib/constants/chartAlignment.js";
import { chordminiBarChords } from "#lib/utils/chordminiBarChords.js";
import type { ChordminiRuns } from "#lib/utils/chordminiRuns.js";
import { jointOnsetComb } from "./alignmentRepair.js";

/**
 * The chartless draft's bar grid from the stems (stem-bench Studies 28 to
 * 31c, 2026-11-08). A song with no chart has only its declared tempo, often
 * the detector's rounded value, anchored at its start; the bench measured
 * that the onset comb's bar is exact (0.02 %) and its lattice right, and
 * that the one open bit is which lattice beat is bar one: the comb's own
 * bar phase lands on the backbeat on two of four real songs. Three
 * witnesses vote a beat class (class k is the comb's phase moved k beats):
 * the recording's start (a DAW export starts on a bar line), the chord
 * changes (they fall on bar one) and the section changes (a checkerboard
 * novelty on beat-synchronous chroma). A decided vote places bar one so
 * that it holds the first sound; an undecided one places nothing, and the
 * draft keeps the declared grid. A song's own start, when it has one, wins
 * over the vote. Pure arithmetic.
 */

/** The comb's lattice: `anchor` a bar line candidate (lead-corrected), its beat and bar in seconds. */
export interface ChartlessLattice {
	anchor: number;
	beat: number;
	period: number;
	beatsPerBar: number;
}

export type WitnessName = "timeZero" | "harmonicRhythm" | "sections";

/** One witness's say: the class it votes (null, it abstains), its weight and what it read. */
export interface DownbeatWitness {
	name: WitnessName;
	cls: number | null;
	weight: number;
	detail: {
		/** Time zero's distance to the nearest lattice beat, in beats. */
		distanceBeats?: number;
		/** Changes or peaks per beat class. */
		histogram?: number[];
		/** The top class's count over the runner-up's, and over it (Infinity when the runner-up has none). */
		margin?: number;
		ratio?: number;
		/** Novelty peaks pooled from both kernels. */
		peaks?: number;
	};
}

/** A placed grid: the bar starts and the end (the shape `barStartsOf` returns), and how it was decided. */
export interface ChartlessGrid {
	barStarts: number[];
	period: number;
	beatsPerBar: number;
	cls: number;
	decided: boolean;
	/** Bar one at the song's own start, the vote skipped. */
	byStart: boolean;
	witnesses: DownbeatWitness[];
}

export interface ChartlessGridInput {
	onset: Float32Array;
	fps: number;
	/** Chroma frames, flattened 12 a frame (`recordingFeatures`). */
	chroma: Float32Array;
	hopSec: number;
	firstSound: number;
	duration: number;
	declaredBarSeconds: number;
	beatsPerBar: number;
	startAt: number | null;
	runs: ChordminiRuns | null;
}

/** The most bars a draft's grid carries (ChartDraftSchema's limit). */
const MAX_BARS = 2000;

const mod = (k: number, n: number) => ((k % n) + n) % n;

/**
 * The comb's lattice near the declared bar (`jointOnsetComb`), its phase
 * moved by `ONSET_ENVELOPE_LEAD_SEC`: the envelope reads onsets about 70 ms
 * early, and Study 31 found time zero 0.058 to 0.079 s off the uncorrected
 * lattice on every song, so every witness reads the corrected one.
 */
export function chartlessLattice(
	onset: Float32Array,
	fps: number,
	declaredBarSeconds: number,
	beatsPerBar: number,
): ChartlessLattice {
	const { period, phase } = jointOnsetComb(onset, fps, declaredBarSeconds);
	return {
		anchor: phase + ONSET_ENVELOPE_LEAD_SEC,
		beat: period / beatsPerBar,
		period,
		beatsPerBar,
	};
}

/** The lattice's beats from time zero to `duration`: their starts and the end, and the first one's index from the anchor. */
function latticeBeats(lattice: ChartlessLattice, duration: number) {
	const first = Math.ceil(-lattice.anchor / lattice.beat - 1e-9);
	const starts: number[] = [];
	for (let k = first; lattice.anchor + k * lattice.beat < duration; k++)
		starts.push(lattice.anchor + k * lattice.beat);
	starts.push(duration);
	return { first, starts };
}

/**
 * The recording's start (Study 31, witness 1): time zero snapped to the
 * nearest lattice beat votes that beat's class when within
 * `TIME_ZERO_SNAP_BEATS`, else abstains (a song that starts mid-bar).
 */
export function timeZeroWitness(lattice: ChartlessLattice): DownbeatWitness {
	const k = Math.round(-lattice.anchor / lattice.beat);
	const distanceBeats = Math.abs(lattice.anchor + k * lattice.beat) / lattice.beat;
	const cls = distanceBeats <= TIME_ZERO_SNAP_BEATS ? mod(k, lattice.beatsPerBar) : null;
	return { name: "timeZero", cls, weight: DOWNBEAT_WEIGHTS.timeZero, detail: { distanceBeats } };
}

/**
 * A histogram's top class, the margin and ratio over the runner-up; the
 * class null under `least` counts in all or on a tie for the top.
 */
function histogramVote(histogram: number[], least: number) {
	const order = histogram.map((_, k) => k).sort((a, b) => histogram[b]! - histogram[a]! || a - b);
	const top = histogram[order[0]!] ?? 0;
	const runner = histogram[order[1]!] ?? 0;
	const total = histogram.reduce((s, n) => s + n, 0);
	const cls = total < least || top === runner ? null : order[0]!;
	return { cls, histogram, margin: top - runner, ratio: runner > 0 ? top / runner : Infinity };
}

const NO_CHORD = new Set(["N", "N.C.", "X", "?", ""]);

/**
 * The chord changes (Study 31, witness 2): a chord per lattice beat voted
 * by frame coverage (`chordminiBarChords` on the beats, so each merged
 * segment's start is a change), the changes between two chords (never to
 * or from no chord) counted per beat class; the top class votes. Abstains
 * without the model's chords, with fewer changes than beats in a bar, or
 * on a tie. On the bench 4 of 4, margins 19 to 14, 56 to 27, 33 to 26, 46 to 11.
 */
export function harmonicRhythmWitness(
	runs: ChordminiRuns | null,
	lattice: ChartlessLattice,
	duration: number,
): DownbeatWitness {
	const histogram = Array.from({ length: lattice.beatsPerBar }, () => 0);
	if (runs) {
		const { first, starts } = latticeBeats(lattice, duration);
		const segments = chordminiBarChords(runs, starts);
		for (let i = 1; i < segments.length; i++) {
			if (NO_CHORD.has(segments[i - 1]!.chord) || NO_CHORD.has(segments[i]!.chord)) continue;
			histogram[mod(first + segments[i]!.bar - 1, lattice.beatsPerBar)]!++;
		}
	}
	const { cls, ...detail } = histogramVote(histogram, lattice.beatsPerBar);
	return { name: "harmonicRhythm", cls, weight: DOWNBEAT_WEIGHTS.harmonicRhythm, detail };
}

/** The chroma summed over each beat (`starts` with the end) and L2-normalized; a beat without frames stays zero. */
function beatChromaOf(chroma: Float32Array, hopSec: number, starts: number[]): Float32Array[] {
	const frames = Math.floor(chroma.length / 12);
	return starts.slice(0, -1).map((start, j) => {
		const lo = Math.floor(start / hopSec);
		const hi = Math.min(frames, Math.max(lo + 1, Math.floor(starts[j + 1]! / hopSec)));
		const sum = new Float32Array(12);
		for (let f = lo; f < hi; f++) for (let c = 0; c < 12; c++) sum[c]! += chroma[f * 12 + c]!;
		const norm = Math.hypot(...sum);
		if (norm > 0) for (let c = 0; c < 12; c++) sum[c]! /= norm;
		return sum;
	});
}

/**
 * Foote's checkerboard novelty on the beats' self-similarity (ported from
 * the bench's reference, Study 31): the Gaussian-tapered kernel
 * `g(i) = exp(-2 (i/L)^2)` signed by quadrant, summed over a ±L-beat
 * window; high where the beats before and after differ and each half
 * agrees with itself.
 */
export function checkerboardNovelty(beatChroma: Float32Array[], L: number): Float32Array {
	const n = beatChroma.length;
	const sim = (a: number, b: number) => {
		if (a < 0 || b < 0 || a >= n || b >= n) return 0;
		const x = beatChroma[a]!;
		const y = beatChroma[b]!;
		let d = 0;
		for (let k = 0; k < x.length; k++) d += x[k]! * y[k]!;
		return d;
	};
	const g = Array.from({ length: 2 * L }, (_, m) => Math.exp(-(((m - L) / L) ** 2) * 2));
	const nov = new Float32Array(n);
	for (let b = 0; b < n; b++) {
		let s = 0;
		for (let i = -L; i < L; i++)
			for (let j = -L; j < L; j++)
				s += (i < 0 ? -1 : 1) * (j < 0 ? -1 : 1) * g[i + L]! * g[j + L]! * sim(b + i, b + j);
		nov[b] = s;
	}
	return nov;
}

/**
 * The novelty's peaks: local maxima above the mean plus one standard
 * deviation, at least L/2 beats apart (the taller kept). Only beats a full
 * kernel from either end count, and the threshold is theirs: past the
 * ends the kernel reads zeros, which makes a peak of the song's edge.
 */
function noveltyPeaks(nov: Float32Array, L: number): number[] {
	const inner = Array.from(nov.subarray(L, Math.max(L, nov.length - L)));
	if (inner.length < 3) return [];
	const mean = inner.reduce((s, x) => s + x, 0) / inner.length;
	const sd = Math.sqrt(inner.reduce((s, x) => s + (x - mean) ** 2, 0) / inner.length);
	const candidates: number[] = [];
	for (let b = L + 1; b < nov.length - L - 1; b++)
		if (nov[b]! > mean + sd && nov[b]! >= nov[b - 1]! && nov[b]! >= nov[b + 1]!) candidates.push(b);
	const kept: number[] = [];
	for (const b of candidates.sort((x, y) => nov[y]! - nov[x]!))
		if (kept.every((k) => Math.abs(k - b) >= L / 2)) kept.push(b);
	return kept;
}

/**
 * The section changes (Study 31, witness 3): beat-synchronous chroma, its
 * checkerboard novelty at each of `SECTION_NOVELTY_SPANS`, the peaks
 * pooled and counted per beat class; the top class votes. Abstains with
 * fewer than two peaks or on a tie. On the bench 4 of 4.
 */
export function sectionWitness(
	chroma: Float32Array,
	hopSec: number,
	lattice: ChartlessLattice,
	duration: number,
): DownbeatWitness {
	const { first, starts } = latticeBeats(lattice, duration);
	const beats = beatChromaOf(chroma, hopSec, starts);
	const peaks = SECTION_NOVELTY_SPANS.flatMap((L) =>
		noveltyPeaks(checkerboardNovelty(beats, L), L),
	);
	const histogram = Array.from({ length: lattice.beatsPerBar }, () => 0);
	for (const b of peaks) histogram[mod(first + b, lattice.beatsPerBar)]!++;
	const { cls, ...detail } = histogramVote(histogram, 2);
	return {
		name: "sections",
		cls,
		weight: DOWNBEAT_WEIGHTS.sections,
		detail: { ...detail, peaks: peaks.length },
	};
}

/**
 * The vote (Study 31's registered rule): each witness's weight on its
 * class; decided when the top score is at least `DOWNBEAT_MIN_SCORE`,
 * beats the runner-up by one, and is class 0 (the comb's own phase) or
 * beats class 0 by `DOWNBEAT_OFF_COMB_MARGIN`. The app's gate on top:
 * when the chord changes are the winner's only witness, their top class
 * must hold `HARMONIC_ALONE_MIN_RATIO` times the runner-up's changes.
 */
export function downbeatVote(
	witnesses: DownbeatWitness[],
	beatsPerBar: number,
): { cls: number; decided: boolean; scores: number[] } {
	const scores = Array.from({ length: beatsPerBar }, () => 0);
	for (const w of witnesses) if (w.cls !== null) scores[w.cls]! += w.weight;
	const order = scores.map((_, k) => k).sort((a, b) => scores[b]! - scores[a]! || a - b);
	const cls = order[0]!;
	const top = scores[cls]!;
	const runner = scores[order[1]!] ?? 0;
	const voters = witnesses.filter((w) => w.cls === cls);
	const alone = voters.length === 1 && voters[0]!.name === "harmonicRhythm";
	const decided =
		top >= DOWNBEAT_MIN_SCORE &&
		top >= runner + 1 &&
		(cls === 0 || top >= scores[0]! + DOWNBEAT_OFF_COMB_MARGIN) &&
		(!alone || (voters[0]!.detail.ratio ?? 0) >= HARMONIC_ALONE_MIN_RATIO);
	return { cls, decided, scores };
}

/**
 * Bar starts every `period` from `a` while under `duration`, then the end
 * (the next start, or the duration): the shape `barStartsOf` returns. A
 * first start before zero is clamped to it (the draft's grid takes no
 * negative time), a pickup bar one; null when nothing fits.
 */
function barStartsFrom(a: number, period: number, duration: number): number[] | null {
	if (!(a < duration)) return null;
	const starts = [Math.max(0, a)];
	for (let i = 1; a + i * period < duration && starts.length < MAX_BARS; i++)
		starts.push(a + i * period);
	starts.push(Math.min(duration, a + starts.length * period));
	return starts;
}

/**
 * Bar one for a voted class (Study 31c): the class names a lattice point
 * modulo one bar, so the representative is the one whose bar holds the
 * first sound, starting no later than `PLACEMENT_FIRST_SOUND_SLACK_BEATS`
 * after it.
 */
export function placeChartlessGrid(
	lattice: ChartlessLattice,
	cls: number,
	firstSound: number,
	duration: number,
): number[] | null {
	const { anchor, beat, period } = lattice;
	const base = anchor + cls * beat;
	// The latest of the class's points at or before the first sound plus the slack.
	const a =
		base +
		Math.floor((firstSound + PLACEMENT_FIRST_SOUND_SLACK_BEATS * beat - base) / period) * period;
	return barStartsFrom(a, period, duration);
}

/** The song's own start wins: bar one at the lattice beat nearest `startAt`, whatever its class, at the comb's period. */
function placedAtStart(lattice: ChartlessLattice, startAt: number, duration: number) {
	const k = Math.round((startAt - lattice.anchor) / lattice.beat);
	const barStarts = barStartsFrom(lattice.anchor + k * lattice.beat, lattice.period, duration);
	if (!barStarts) return null;
	const { period, beatsPerBar } = lattice;
	const cls = mod(k, beatsPerBar);
	return { barStarts, period, beatsPerBar, cls, decided: true, byStart: true, witnesses: [] };
}

/**
 * The whole read: the lattice, then bar one at the song's start when it
 * has one, else the three witnesses and the vote. Null when the vote is
 * undecided or nothing fits: the draft keeps the declared grid.
 */
export function chartlessGrid(input: ChartlessGridInput): ChartlessGrid | null {
	const { onset, fps, duration, beatsPerBar, declaredBarSeconds } = input;
	if (onset.length === 0 || !(declaredBarSeconds > 0) || !(beatsPerBar >= 1)) return null;
	const lattice = chartlessLattice(onset, fps, declaredBarSeconds, beatsPerBar);
	if (input.startAt !== null) return placedAtStart(lattice, input.startAt, duration);
	const witnesses = [
		timeZeroWitness(lattice),
		harmonicRhythmWitness(input.runs, lattice, duration),
		sectionWitness(input.chroma, input.hopSec, lattice, duration),
	];
	const vote = downbeatVote(witnesses, beatsPerBar);
	if (!vote.decided) return null;
	const barStarts = placeChartlessGrid(lattice, vote.cls, input.firstSound, duration);
	if (!barStarts) return null;
	const { period } = lattice;
	return {
		barStarts,
		period,
		beatsPerBar,
		cls: vote.cls,
		decided: true,
		byStart: false,
		witnesses,
	};
}
