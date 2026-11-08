import { describe, expect, test } from "vite-plus/test";
import {
	alignChart,
	alignChartPath,
	alignmentEnvelope,
	audibleSpan,
	chromagram,
	dtwAlign,
	renderChartPads,
	repairAlignment,
} from "./chartAlignment.js";

const RATE = 22050;
const PROGRESSION = ["D", "A", "Bm", "G", "Em", "F#m", "C", "E7", "Dsus4", "Am", "Bb", "F"];
/** Every bar a new chord: a boundary between two bars of one chord is invisible to chroma, and no test of placement. */
const barsAt = (bpm: number) =>
	[...PROGRESSION, ...PROGRESSION].map((c) => ({ chords: [c], bpm, meter: "4/4" }));

const peakIn = (samples: Float32Array, from: number, to: number) => {
	let peak = 0;
	for (let i = Math.floor(from * RATE); i < Math.floor(to * RATE); i++)
		peak = Math.max(peak, Math.abs(samples[i]!));
	return peak;
};

describe("renderChartPads", () => {
	test("bar starts follow each bar's tempo and meter; 6/8 counts eighths, as the song's changes do", () => {
		const { samples, barStarts } = renderChartPads(
			[
				{ chords: ["C"], bpm: 120, meter: "4/4" },
				{ chords: ["G"], bpm: 60, meter: "3/4" },
				{ chords: ["F"], bpm: 120, meter: "6/8" },
			],
			RATE,
		);
		expect(barStarts).toEqual([0, 2, 5, 8]);
		expect(samples.length).toBe(8 * RATE);
	});

	test("a held bar continues the chord before it; N.C. is silent, and holds its silence", () => {
		const held = renderChartPads(
			[
				{ chords: ["C"], bpm: 120, meter: "4/4" },
				{ chords: [], bpm: 120, meter: "4/4" },
			],
			RATE,
		).samples;
		expect(peakIn(held, 2.1, 3.9)).toBeGreaterThan(0.1);
		const silent = renderChartPads(
			[
				{ chords: ["C"], bpm: 120, meter: "4/4" },
				{ chords: ["N.C."], bpm: 120, meter: "4/4" },
				{ chords: [], bpm: 120, meter: "4/4" },
			],
			RATE,
		).samples;
		expect(peakIn(silent, 2, 6)).toBe(0);
	});
});

describe("chromagram", () => {
	test("a pure A4 sine peaks at pitch class 9", () => {
		const sine = Float32Array.from({ length: RATE }, (_, i) =>
			Math.sin((2 * Math.PI * 440 * i) / RATE),
		);
		const { frames, hopSec } = chromagram(sine, RATE);
		expect(hopSec).toBeCloseTo(2048 / RATE, 6);
		for (const f of frames) expect(f.indexOf(Math.max(...f))).toBe(9);
	});

	test("the window is the bench's in seconds at other rates, a power of two", () => {
		expect(chromagram(new Float32Array(48000), 48000).hopSec).toBeCloseTo(4096 / 48000, 6);
		expect(chromagram(new Float32Array(44100), 44100).hopSec).toBeCloseTo(4096 / 44100, 6);
	});
});

describe("dtwAlign", () => {
	test("a sequence against itself costs nothing and maps every second to itself, within a hop", () => {
		const { frames, hopSec } = chromagram(
			renderChartPads(barsAt(120).slice(0, 4), RATE).samples,
			RATE,
		);
		const result = dtwAlign(frames, frames, hopSec);
		expect(result.normalizedCost).toBeCloseTo(0, 6);
		expect(result.path[0]).toEqual([0, 0]);
		expect(result.path.at(-1)).toEqual([frames.length - 1, frames.length - 1]);
		for (const t of [2, 4, 6])
			expect(Math.abs(result.mapSeconds(t) - t)).toBeLessThanOrEqual(hopSec);
		expect(result.frameCost.length).toBe(frames.length);
	});
});

describe("alignChart", () => {
	const truth = renderChartPads(barsAt(120), RATE);
	const alignment = alignChart(barsAt(108), truth.samples, RATE);

	test("a chart declared 10 % slow still puts every path bar start within a hop of its true time", () => {
		expect(alignment.rawBarStarts).toHaveLength(truth.barStarts.length);
		const errors = alignment.rawBarStarts
			.slice(0, -1)
			.map((at, i) => Math.abs(at - truth.barStarts[i]!));
		// The path moves a frame at a time, so a boundary lands within a hop of where it is; one bar
		// here lands 0.4 ms past it (1.004 hops), hence the tenth of a hop of slack.
		for (const error of errors) expect(error).toBeLessThanOrEqual(1.1 * alignment.hopSec);
		expect(errors.reduce((a, b) => a + b, 0) / errors.length).toBeLessThan(alignment.hopSec / 2);
		expect(alignment.localCost).toHaveLength(barsAt(108).length);
	});

	test("the tritone control costs at least twice the right chart", () => {
		expect(alignment.controlCost).toBeGreaterThanOrEqual(2 * alignment.cost);
		expect(alignment.controlCost).toBeGreaterThan(0.1);
	});

	test("the recording's first and last sound come with the alignment", () => {
		expect(alignment.firstSound).toBeLessThanOrEqual(0.05);
		expect(Math.abs(alignment.lastSound - truth.samples.length / RATE)).toBeLessThanOrEqual(0.05);
	});

	test("the grid re-phase finds the recording's bar from the 10 % slow declaration and, the path being clean, keeps every start on it", () => {
		expect(alignment.repair).not.toBeNull();
		expect(Math.abs(alignment.repair!.period - 2) / 2).toBeLessThan(0.005);
		expect(alignment.repair!.rephased).toBe(0);
		expect(alignment.repair!.confidence).toHaveLength(alignment.barStarts.length);
		expect(alignment.repair!.confidence.every((c) => c === "aligned")).toBe(true);
		// The onset envelope reads a hard onset about 70 ms early (constants ONSET_ENVELOPE_LEAD_SEC);
		// with the lead added back the slid line sits on the pads: every start within 25 ms of the
		// truth and the mean signed error within 15 ms, where the uncorrected line sat 70 ms early.
		expect(alignment.barStarts).toHaveLength(truth.barStarts.length);
		const signed = alignment.barStarts.slice(0, -1).map((t, i) => t - truth.barStarts[i]!);
		for (const e of signed) expect(Math.abs(e)).toBeLessThanOrEqual(0.025);
		expect(Math.abs(signed.reduce((a, b) => a + b, 0) / signed.length)).toBeLessThanOrEqual(0.015);
	});

	test("a path whose bar starts sit 0.1 s off the pads comes back re-phased, delta 0.1 s more negative, on the same line", () => {
		const path = alignChartPath(barsAt(120), truth.samples, RATE);
		const envelope = alignmentEnvelope(truth.samples, RATE);
		const withStarts = (starts: number[]) =>
			repairAlignment(
				{ ...path, alignment: { ...path.alignment, barStarts: starts, rawBarStarts: starts } },
				envelope,
			);
		// The reference: the true bar starts re-phased, which lands on the envelope's stamp of the pads.
		const onPads = withStarts([...truth.barStarts]);
		const late = withStarts(truth.barStarts.map((t) => t + 0.1));
		expect(onPads.repair).not.toBeNull();
		expect(late.repair).not.toBeNull();
		expect(Math.abs(late.repair!.delta - onPads.repair!.delta + 0.1)).toBeLessThanOrEqual(0.02);
		for (const [i, t] of late.barStarts.entries())
			expect(Math.abs(t - onPads.barStarts[i]!)).toBeLessThanOrEqual(0.02);
	});

	test("nothing to align, or a chart that cannot fit, is an error with a reason", () => {
		expect(() => alignChart([], truth.samples, RATE)).toThrow("no bars");
		expect(() => alignChart(barsAt(40), truth.samples, RATE)).toThrow("twice as long");
	});
});

describe("audibleSpan", () => {
	test("a silence-padded tone gives the tone's bounds within one window", () => {
		const samples = new Float32Array(5 * RATE);
		for (let i = 1.3 * RATE; i < 3.7 * RATE; i++)
			samples[i] = 0.5 * Math.sin((2 * Math.PI * 220 * i) / RATE);
		const { first, last } = audibleSpan(samples, RATE);
		expect(Math.abs(first - 1.3)).toBeLessThanOrEqual(0.05);
		expect(Math.abs(last - 3.7)).toBeLessThanOrEqual(0.05);
	});

	test("noise under the floor is not sound; silence gives 0 and the length", () => {
		const samples = Float32Array.from({ length: 2 * RATE }, (_, i) => (i % 2 ? 0.001 : -0.001));
		for (let i = 0.5 * RATE; i < RATE; i++)
			samples[i] = 0.5 * Math.sin((2 * Math.PI * 220 * i) / RATE);
		const span = audibleSpan(samples, RATE);
		expect(Math.abs(span.first - 0.5)).toBeLessThanOrEqual(0.05);
		expect(Math.abs(span.last - 1)).toBeLessThanOrEqual(0.05);
		expect(audibleSpan(new Float32Array(RATE), RATE)).toEqual({ first: 0, last: 1 });
	});
});
