import { describe, expect, test } from "vite-plus/test";
import { parseChord } from "barmark";
import { tonicPitchClass } from "#lib/utils/tonicPitchClass.js";
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
	test("root and fifth alone are a power chord, with or without a faint third", () => {
		expect(chordOf(profileOf([2, 9]), 2).chord).toBe("D5");
		expect(chordOf(profileOf([2, 9, 2, 9, 2, 9, 2, 9, 2, 9]), 2).chord).toBe("D5");
		// A third that sounds makes it the triad again; a sus needs its second or fourth.
		expect(chordOf(profileOf([2, 6, 9]), 2).chord).toBe("D");
		expect(chordOf(profileOf([2, 7, 9]), 2).chord).toBe("Dsus4");
	});
	test("a faint second beside root and fifth is a harmonic, not a sus2", () => {
		// B 63 %, F# 27 %, C# 10 %: stem-bench's power-chord song as Basic Pitch hears it.
		const faint = [0, 0, 0, 0, 0, 0, 27, 0, 0, 0, 0, 63];
		faint[1] = 10;
		expect(chordOf(faint, 11).chord).toBe("B5");
		const real = [...faint];
		real[1] = 25;
		expect(chordOf(real, 11).chord).toBe("Bsus2");
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
	test("a bass pickup into the next bar does not rename this one", () => {
		// Two bars of E5 (E2, E3, E4), then C#m; the bass plays C#2 for the last tenth of bar 2.
		const notes = [
			note(0, 2, 40),
			note(0, 2, 52),
			note(0, 2, 64),
			{ start: 1.9 * bar, end: 2 * bar, pitch: 37, amplitude: 0.8 },
			note(2, 1, 37),
			note(2, 1, 52),
			note(2, 1, 56),
		];
		expect(chordsPerBar(notes, [0, bar, 2 * bar, 3 * bar]).map((s) => s.chord)).toEqual([
			"E5",
			"C#m",
		]);
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

describe("names barmark reads", () => {
	// Every template on every root, alone and over another bass: the detector's name must parse as barmark and sound the template's notes.
	const SHAPES = [
		[0, 4, 7],
		[0, 3, 7],
		[0, 4, 7, 10],
		[0, 4, 7, 11],
		[0, 3, 7, 10],
		[0, 5, 7],
		[0, 5, 7, 10],
		[0, 2, 7],
		[0, 3, 6],
		[0, 4, 8],
		[0, 7],
	];
	test.each(SHAPES)("%j", (...shape) => {
		for (let root = 0; root < 12; root++) {
			const profile = new Float64Array(12);
			for (const i of shape) profile[(root + i) % 12] = 1;
			const { chord } = chordOf(profile, root);
			const parsed = parseChord(chord);
			expect(parsed.ok, chord).toBe(true);
			if (!parsed.ok) continue;
			const named = new Set(parsed.value.pitches.map((p) => tonicPitchClass(p)));
			expect(named, chord).toEqual(new Set(shape.map((i) => (root + i) % 12)));
		}
	});
	test("a slash bass parses, and the chart shows ♯ and ♭", () => {
		const profile = new Float64Array(12);
		for (const pc of [1, 4, 8]) profile[pc] = 1;
		profile[8] = 1.5;
		const { chord } = chordOf(profile, 8);
		expect(parseChord(chord).ok, chord).toBe(true);
		expect(
			chordChart([
				{ bar: 1, bars: 1, start: 0, chord: "F#m", confidence: 1 },
				{ bar: 2, bars: 1, start: 0, chord: "Bbdim", confidence: 1 },
				{ bar: 3, bars: 1, start: 0, chord: "N.C.", confidence: 0 },
			]),
		).toBe("| F♯m | B♭° | N.C. |");
	});
});
