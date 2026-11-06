import { describe, expect, test } from "vite-plus/test";
import { chordminiBarChords } from "./chordminiBarChords";

const frameSec = 2048 / 22050;
/** Runs over `frames` frames from a list of [chord, frames] pairs. */
const stored = (pairs: [string, number][]) => {
	let at = 0;
	const runs = pairs.map(([chord, n]) => {
		const r = { start: at, end: at + n, chord, label: chord };
		at += n;
		return r;
	});
	return { version: "test", frameSec, frames: at, runs };
};
/** Bar starts for `bars` bars of `frames` frames each, plus the end. */
const bars = (count: number, framesPerBar: number) =>
	Array.from({ length: count + 1 }, (_, i) => i * framesPerBar * frameSec);

describe("chordminiBarChords", () => {
	test("each bar takes the label most of its frames carry, and equal bars merge", () => {
		// Bars of 20 frames: D for 45 frames, then G.
		const out = chordminiBarChords(
			stored([
				["D", 45],
				["G", 35],
			]),
			bars(4, 20),
		);
		expect(out).toEqual([
			{ bar: 1, bars: 2, start: 0, chord: "D", confidence: 1 },
			{ bar: 3, bars: 2, start: 40 * frameSec, chord: "G", confidence: expect.closeTo(0.875, 3) },
		]);
	});
	test("a bar votes only over the frames that exist; a bar past them is N.C.; an empty bar list gives nothing", () => {
		expect(chordminiBarChords(stored([["A", 10]]), bars(2, 20))).toEqual([
			{ bar: 1, bars: 1, start: 0, chord: "A", confidence: 1 },
			{ bar: 2, bars: 1, start: 20 * frameSec, chord: "N.C.", confidence: 0 },
		]);
		expect(chordminiBarChords(stored([["A", 10]]), [])).toEqual([]);
	});
	test("a very short bar still votes one frame", () => {
		const out = chordminiBarChords(stored([["E", 5]]), [0, 0.01, 0.02]);
		expect(out.map((s) => s.chord)).toEqual(["E"]);
		expect(out[0].bars).toBe(2);
	});
	test("the model's N (no chord) is already the chart's N.C. and merges with a bar past the end", () => {
		const out = chordminiBarChords(stored([["N.C.", 20]]), bars(2, 20));
		expect(out).toEqual([{ bar: 1, bars: 2, start: 0, chord: "N.C.", confidence: 0.5 }]);
	});
});
