import { describe, expect, test } from "vite-plus/test";
import { chordChart, chordOf, chordsPerBar, type Note } from "./chords";

const profileOf = (pcs: number[]) => {
	const p = Array.from({ length: 12 }, () => 0);
	for (const pc of pcs) p[pc] += 1;
	return p;
};

describe("chordOf", () => {
	test("major, minor and seventh from their pitch classes", () => {
		expect(chordOf(profileOf([2, 6, 9]), 2).chord).toBe("D");
		expect(chordOf(profileOf([11, 2, 6]), 11).chord).toBe("Bm");
		expect(chordOf(profileOf([9, 1, 4, 7]), 9).chord).toBe("A7");
	});
	test("a bass note outside the chord is shown as a slash chord", () => {
		expect(chordOf(profileOf([7, 11, 2, 7, 11, 2]), 11).chord).toBe("G/B");
	});
	test("silence is no chord", () => {
		expect(chordOf(profileOf([]), null).chord).toBe("N.C.");
	});
});

describe("chordsPerBar", () => {
	const bar = 2; // seconds per bar
	const note = (start: number, bars: number, pitch: number): Note => ({
		start: start * bar,
		end: (start + bars) * bar,
		pitch,
		amplitude: 0.8,
	});
	test("one chord per bar, merged when it holds", () => {
		const notes = [
			...[50, 62, 66, 69].map((p) => note(0, 2, p)), // D for two bars
			...[45, 57, 61, 64].map((p) => note(2, 1, p)), // A
			...[43, 55, 59, 62].map((p) => note(3, 1, p)), // G
		];
		const segments = chordsPerBar(notes, [0, 2, 4, 6, 8]);
		expect(segments.map((s) => [s.chord, s.bar, s.bars])).toEqual([
			["D", 1, 2],
			["A", 3, 1],
			["G", 4, 1],
		]);
		expect(chordChart(segments)).toBe("| D | % | A | G |");
	});
	test("an empty bar is N.C.", () => {
		expect(chordsPerBar([], [0, 2]).map((s) => s.chord)).toEqual(["N.C."]);
	});
});
