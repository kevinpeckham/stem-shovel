import { describe, expect, test } from "vite-plus/test";
import { ONSET_ENVELOPE_LEAD_SEC } from "#lib/constants/chartAlignment.js";
import type { ChordminiRuns } from "#lib/utils/chordminiRuns.js";
import {
	chartlessGrid,
	chartlessLattice,
	checkerboardNovelty,
	downbeatVote,
	harmonicRhythmWitness,
	placeChartlessGrid,
	sectionWitness,
	timeZeroWitness,
} from "./chartlessGrid.js";

const FPS = 100;
const FRAME_SEC = 0.0929;
const HOP_SEC = 0.1;

/** A song's truth: its tempo, beats to the bar, where its first downbeat is and how many bars it plays. */
interface Song {
	bpm: number;
	beatsPerBar: number;
	downbeat: number;
	bars: number;
}

const beatOf = (s: Song) => 60 / s.bpm;
const periodOf = (s: Song) => beatOf(s) * s.beatsPerBar;
/** The recording ends a little before the next bar would start, so the grid is the song's bars. */
const durationOf = (s: Song) => s.downbeat + s.bars * periodOf(s) - 0.2;
/** The true bar starts. */
const truthOf = (s: Song) => Array.from({ length: s.bars }, (_, i) => s.downbeat + i * periodOf(s));

/** A seeded uniform draw in [0, 1). */
function seeded(seed = 3) {
	return () => (seed = (seed * 48271) % 2147483647) / 2147483647;
}

/**
 * The onset envelope a real one would read (100 fps): a hit on every beat,
 * `gainOf(beatInBar)` strong, stamped `ONSET_ENVELOPE_LEAD_SEC` early as the
 * envelope stamps them, smeared over ±0.12 s, over low noise.
 */
function onsetOf(s: Song, gainOf: (beatInBar: number) => number): Float32Array {
	const onset = new Float32Array(Math.round(durationOf(s) * FPS));
	const rand = seeded();
	for (let f = 0; f < onset.length; f++) onset[f] = 0.04 * rand();
	for (let b = 0; b < s.bars * s.beatsPerBar; b++) {
		const at = Math.round((s.downbeat + b * beatOf(s) - ONSET_ENVELOPE_LEAD_SEC) * FPS);
		for (let k = -12; k <= 12; k++) {
			const f = at + k;
			if (f >= 0 && f < onset.length) onset[f]! += gainOf(b % s.beatsPerBar) * 0.75 ** Math.abs(k);
		}
	}
	return onset;
}

/** Backbeats louder than the downbeats: the comb's bar phase lands on beat 2 or 4. */
const backbeat = (b: number) => (b % 2 === 1 ? 1 : 0.45);

const CHORDS = ["C", "F", "G", "A:min"];

/**
 * The model's frames: a chord from each of `changes` (seconds, in order) to
 * the next, cycling through four, no chord before the first.
 */
function runsOf(changes: number[], duration: number): ChordminiRuns {
	const frames = Math.ceil(duration / FRAME_SEC);
	const at = (t: number) => Math.min(frames, Math.round(t / FRAME_SEC));
	const runs = changes.map((t, i) => {
		const label = CHORDS[i % CHORDS.length]!;
		return { start: at(t), end: at(changes[i + 1] ?? duration), chord: label, label };
	});
	return { version: "test", frameSec: FRAME_SEC, frames, runs };
}

/** A chord change on every true downbeat. */
const onDownbeats = (s: Song) => runsOf(truthOf(s), durationOf(s));

/** Chroma (flattened, 12 a frame) whose profile alternates every `barsPerSection` bars. */
function sectionsOf(s: Song, barsPerSection: number): Float32Array {
	const frames = Math.ceil(durationOf(s) / HOP_SEC);
	const a = [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0];
	const b = [0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0];
	const chroma = new Float32Array(frames * 12);
	for (let f = 0; f < frames; f++) {
		const bar = Math.floor((f * HOP_SEC - s.downbeat) / periodOf(s));
		chroma.set(Math.floor(bar / barsPerSection) % 2 ? b : a, f * 12);
	}
	return chroma;
}

const NO_CHROMA = new Float32Array(0);

function inputOf(s: Song, over: Partial<Parameters<typeof chartlessGrid>[0]> = {}) {
	return {
		onset: onsetOf(s, backbeat),
		fps: FPS,
		chroma: sectionsOf(s, 8),
		hopSec: HOP_SEC,
		firstSound: s.downbeat,
		duration: durationOf(s),
		// The detector's rounded tempo: the declared bar 1 % long.
		declaredBarSeconds: periodOf(s) * 1.01,
		beatsPerBar: s.beatsPerBar,
		startAt: null,
		runs: onDownbeats(s),
		...over,
	};
}

/** Every placed bar start within `tol` of the nearest true bar start. */
function expectOnTruth(starts: number[], s: Song, tol = 0.03) {
	const truth = truthOf(s);
	for (const t of starts.slice(0, -1)) {
		const nearest = Math.min(...truth.map((x) => Math.abs(x - t)));
		expect(nearest).toBeLessThanOrEqual(tol);
	}
}

/** The beat class of the true downbeat on the lattice. */
function trueClass(s: Song, input: ReturnType<typeof inputOf>) {
	const lattice = chartlessLattice(input.onset, FPS, input.declaredBarSeconds, s.beatsPerBar);
	const k = Math.round((s.downbeat - lattice.anchor) / lattice.beat);
	return { lattice, cls: (((k % s.beatsPerBar) + s.beatsPerBar) % s.beatsPerBar) as number };
}

const FROM_ZERO: Song = { bpm: 117, beatsPerBar: 4, downbeat: 0, bars: 40 };

describe("chartlessGrid", () => {
	test("the comb lands on a backbeat; all three witnesses vote the true downbeat and bar one holds the first sound", () => {
		const input = inputOf(FROM_ZERO);
		const { lattice, cls } = trueClass(FROM_ZERO, input);
		expect(Math.abs(lattice.period - periodOf(FROM_ZERO)) / periodOf(FROM_ZERO)).toBeLessThan(
			0.001,
		);
		expect([1, 3]).toContain(cls);
		const grid = chartlessGrid(input)!;
		expect(grid).not.toBeNull();
		expect(grid.byStart).toBe(false);
		expect(grid.cls).toBe(cls);
		expect(grid.witnesses.map((w) => [w.name, w.cls])).toEqual([
			["timeZero", cls],
			["harmonicRhythm", cls],
			["sections", cls],
		]);
		expect(grid.barStarts[0]).toBeLessThanOrEqual(input.firstSound + 0.03);
		expect(grid.barStarts[1]).toBeGreaterThan(input.firstSound);
		expect(grid.barStarts).toHaveLength(FROM_ZERO.bars + 1);
		expect(grid.barStarts.at(-1)).toBeCloseTo(durationOf(FROM_ZERO), 6);
		expectOnTruth(grid.barStarts, FROM_ZERO);
	});

	describe("a song that starts mid-bar", () => {
		const s: Song = { bpm: 117, beatsPerBar: 4, downbeat: 2.5 * (60 / 117), bars: 40 };

		test("time zero abstains; the chord changes decide on a clear margin", () => {
			const input = inputOf(s, { chroma: NO_CHROMA });
			const { cls } = trueClass(s, input);
			const grid = chartlessGrid(input)!;
			expect(grid).not.toBeNull();
			const [zero, harmonic, sections] = grid.witnesses;
			expect(zero!.cls).toBeNull();
			expect(zero!.detail.distanceBeats).toBeGreaterThan(0.25);
			expect(harmonic!.cls).toBe(cls);
			expect(sections!.cls).toBeNull();
			expect(grid.barStarts[0]).toBeCloseTo(s.downbeat, 1);
			expectOnTruth(grid.barStarts, s);
		});

		test("a chord on every beat is a flat histogram: undecided, nothing placed", () => {
			const everyBeat = Array.from({ length: s.bars * 4 }, (_, b) => s.downbeat + b * beatOf(s));
			const input = inputOf(s, { chroma: NO_CHROMA, runs: runsOf(everyBeat, durationOf(s)) });
			expect(chartlessGrid(input)).toBeNull();
		});

		test("the chord changes alone under 1.2 times the runner-up: undecided", () => {
			// A change on every downbeat, and on beat 3 of all but four bars: 40 against 36.
			const changes = truthOf(s).flatMap((t, i) => (i % 10 === 9 ? [t] : [t, t + 2 * beatOf(s)]));
			const input = inputOf(s, { chroma: NO_CHROMA, runs: runsOf(changes, durationOf(s)) });
			const lattice = chartlessLattice(input.onset, FPS, input.declaredBarSeconds, 4);
			expect(timeZeroWitness(lattice).cls).toBeNull();
			const harmonic = harmonicRhythmWitness(input.runs, lattice, input.duration);
			expect(harmonic.cls).toBe(trueClass(s, input).cls);
			expect(harmonic.detail.ratio).toBeGreaterThan(1);
			expect(harmonic.detail.ratio).toBeLessThan(1.2);
			expect(chartlessGrid(input)).toBeNull();
		});
	});

	test("the song's own start wins: bar one at the lattice beat nearest it, whatever its class", () => {
		const backbeatAt = truthOf(FROM_ZERO)[3]! + beatOf(FROM_ZERO);
		const grid = chartlessGrid(inputOf(FROM_ZERO, { startAt: backbeatAt + 0.1 }))!;
		expect(grid.byStart).toBe(true);
		expect(grid.witnesses).toEqual([]);
		expect(Math.abs(grid.barStarts[0]! - backbeatAt)).toBeLessThanOrEqual(0.03);
		const period = periodOf(FROM_ZERO);
		expect(grid.barStarts[1]! - grid.barStarts[0]!).toBeCloseTo(period, 2);
	});

	test("a 3/4 song: the comb on beat 2, the vote back on the downbeat", () => {
		const s: Song = { bpm: 150, beatsPerBar: 3, downbeat: 0, bars: 60 };
		const input = { ...inputOf(s), onset: onsetOf(s, (b) => (b === 1 ? 1 : 0.45)) };
		const { cls } = trueClass(s, input);
		expect(cls).toBe(2);
		const grid = chartlessGrid(input)!;
		expect(grid.beatsPerBar).toBe(3);
		expect(grid.cls).toBe(cls);
		expectOnTruth(grid.barStarts, s);
	});
});

describe("downbeatVote", () => {
	const witness = (
		name: "timeZero" | "harmonicRhythm" | "sections",
		cls: number | null,
		ratio = 2,
	) => ({
		name,
		cls,
		weight: { timeZero: 2, harmonicRhythm: 2, sections: 1 }[name],
		detail: { ratio },
	});

	test("the sections alone never decide; off the comb a move needs two over class 0", () => {
		expect(downbeatVote([witness("sections", 2)], 4).decided).toBe(false);
		expect(downbeatVote([witness("timeZero", 2), witness("sections", 0)], 4).decided).toBe(false);
		expect(downbeatVote([witness("timeZero", 2), witness("harmonicRhythm", 2)], 4)).toMatchObject({
			cls: 2,
			decided: true,
		});
		expect(downbeatVote([witness("timeZero", 1), witness("harmonicRhythm", 3)], 4).decided).toBe(
			false,
		);
	});
});

describe("the section witness", () => {
	test("the checkerboard peaks where the chroma changes", () => {
		const a = Float32Array.from([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
		const b = Float32Array.from([0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0]);
		const beats = Array.from({ length: 64 }, (_, i) => (i < 32 ? a : b));
		const nov = checkerboardNovelty(beats, 8);
		const peak = nov.indexOf(Math.max(...nov.subarray(8, 56)));
		expect(peak).toBe(32);
	});

	test("votes the class its section changes fall on", () => {
		const lattice = chartlessLattice(onsetOf(FROM_ZERO, backbeat), FPS, periodOf(FROM_ZERO), 4);
		const witness = sectionWitness(
			sectionsOf(FROM_ZERO, 8),
			HOP_SEC,
			lattice,
			durationOf(FROM_ZERO),
		);
		expect(witness.cls).toBe(trueClass(FROM_ZERO, inputOf(FROM_ZERO)).cls);
		expect(witness.detail.peaks).toBeGreaterThanOrEqual(2);
	});
});

describe("placeChartlessGrid", () => {
	const lattice = { anchor: 0.75, beat: 0.5, period: 2, beatsPerBar: 4 };

	test("bar one is the class's lattice point whose bar holds the first sound", () => {
		expect(placeChartlessGrid(lattice, 1, 5.3, 12)!.slice(0, 2)).toEqual([5.25, 7.25]);
		// Within a quarter beat after the first sound, the bar starts there.
		expect(placeChartlessGrid(lattice, 0, 4.7, 12)![0]).toBe(4.75);
	});

	test("a bar one before time zero is clamped to it; the end closes the grid", () => {
		const starts = placeChartlessGrid(lattice, 1, 0, 5)!;
		expect(starts).toEqual([0, 1.25, 3.25, 5]);
	});
});
