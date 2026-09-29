import { describe, expect, test } from "vite-plus/test";
import { nameChord } from "./chordName";
import { degreeOf, scalePitchClasses } from "./scaleDegrees";

const C = 60;
const key = { root: 0, mode: "major" as const };

describe("nameChord", () => {
	test("a note, an interval, an octave", () => {
		expect(nameChord([C])?.name).toBe("C");
		expect(nameChord([C, C + 7])?.name).toBe("a fifth");
		expect(nameChord([C, C + 4])?.name).toBe("a major third");
		expect(nameChord([C, C + 12])?.name).toBe("C octaves");
	});
	test("triads, sevenths, suspensions, with the numeral in a key", () => {
		expect(nameChord([C, C + 4, C + 7], key)).toMatchObject({ name: "C", numeral: "I" });
		expect(nameChord([C + 2, C + 5, C + 9], key)).toMatchObject({ name: "Dm", numeral: "ii" });
		expect(nameChord([C + 7, C + 11, C + 14, C + 17], key)).toMatchObject({
			name: "G7",
			numeral: "V7",
		});
		expect(nameChord([C + 11, C + 14, C + 17], key)).toMatchObject({
			name: "Bdim",
			numeral: "vii°",
		});
		expect(nameChord([C, C + 5, C + 7])?.name).toBe("Csus4");
		expect(nameChord([C, C + 4, C + 7, C + 11])?.name).toBe("Cmaj7");
		expect(nameChord([C + 9, C + 12, C + 16, C + 19], key)).toMatchObject({
			name: "Am7",
			numeral: "vi7",
		});
		expect(nameChord([C, C + 4, C + 8])?.name).toBe("Caug");
	});
	test("an inversion reads as a slash chord, and a chord off the key has no numeral", () => {
		expect(nameChord([C + 4, C + 7, C + 12], key)).toMatchObject({ name: "C/E", numeral: "I" });
		expect(nameChord([C + 1, C + 5, C + 8], key)).toMatchObject({ name: "C♯", numeral: null });
	});
	test("notes that are no chord are listed, and nothing is nothing", () => {
		expect(nameChord([C, C + 1, C + 2])?.name).toBe("C C♯ D");
		expect(nameChord([])).toBeNull();
	});
});

describe("scales", () => {
	test("the scale's pitch classes and degrees", () => {
		expect([...scalePitchClasses({ root: 7, mode: "major" })].sort((a, b) => a - b)).toEqual([
			0, 2, 4, 6, 7, 9, 11,
		]);
		expect(degreeOf(7, { root: 7, mode: "major" })).toBe(1);
		expect(degreeOf(6, { root: 7, mode: "major" })).toBe(7);
		expect(degreeOf(5, { root: 7, mode: "major" })).toBeNull();
		expect(
			[...scalePitchClasses({ root: 9, mode: "minor-pentatonic" })].sort((a, b) => a - b),
		).toEqual([0, 2, 4, 7, 9]);
	});
});
