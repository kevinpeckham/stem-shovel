import { describe, expect, test } from "vite-plus/test";
import { chordPitchClasses } from "./chordPitchClasses.js";

const tones = (s: string) => chordPitchClasses(s)?.tones.toSorted((a, b) => a - b) ?? null;

describe("chordPitchClasses", () => {
	test("triads by quality, the root first", () => {
		expect(chordPitchClasses("C")).toEqual({ root: 0, tones: [0, 4, 7] });
		expect(chordPitchClasses("Am")).toEqual({ root: 9, tones: [9, 0, 4] });
		expect(tones("Bdim")).toEqual([2, 5, 11]);
		expect(tones("B°")).toEqual([2, 5, 11]);
		expect(tones("Caug")).toEqual([0, 4, 8]);
		expect(tones("C+")).toEqual([0, 4, 8]);
		expect(tones("Dsus2")).toEqual([2, 4, 9]);
		expect(tones("Dsus4")).toEqual([2, 7, 9]);
		expect(tones("Dsus")).toEqual([2, 7, 9]);
		expect(tones("E5")).toEqual([4, 11]);
		expect(tones("Cmin")).toEqual([0, 3, 7]);
		expect(tones("C−")).toEqual([0, 3, 7]);
	});

	test("accidentals in either spelling", () => {
		expect(chordPitchClasses("F#m")?.root).toBe(6);
		expect(chordPitchClasses("F♯m")?.root).toBe(6);
		expect(chordPitchClasses("Bb")?.root).toBe(10);
		expect(chordPitchClasses("B♭maj7")?.root).toBe(10);
		expect(chordPitchClasses("Cb")?.root).toBe(11);
	});

	test("sevenths, sixths and ninths where the suffix says so", () => {
		expect(tones("G7")).toEqual([2, 5, 7, 11]);
		expect(tones("Cmaj7")).toEqual([0, 4, 7, 11]);
		expect(tones("CΔ")).toEqual([0, 4, 7, 11]);
		expect(tones("Am7")).toEqual([0, 4, 7, 9]);
		expect(tones("C6")).toEqual([0, 4, 7, 9]);
		expect(tones("C9")).toEqual([0, 2, 4, 7, 10]);
		expect(tones("Cadd9")).toEqual([0, 2, 4, 7]);
		expect(tones("Cdim7")).toEqual([0, 3, 6, 9]);
		expect(tones("Cø")).toEqual([0, 3, 6, 10]);
		expect(tones("Cm7b5")).toEqual([0, 3, 6, 10]);
		expect(tones("C6/9")).toEqual([0, 2, 4, 7, 9]);
	});

	test("a 5 keeps no third whatever is added, in the Logic Pro sense; parentheses add; Sus in either case", () => {
		expect(tones("G5(7)")).toEqual([2, 5, 7]);
		expect(tones("F#(5)(7)")).toEqual([1, 4, 6]);
		expect(tones("E5(7)")).toEqual([2, 4, 11]);
		expect(tones("G7")).toEqual([2, 5, 7, 11]);
		expect(tones("D(7)sus4")).toEqual([0, 2, 7, 9]);
		expect(tones("D(7)Sus4")).toEqual([0, 2, 7, 9]);
		expect(tones("Gsus2")).toEqual([2, 7, 9]);
		expect(tones("C#(7)")).toEqual([1, 5, 8, 11]);
	});

	test("a slash bass adds its pitch class", () => {
		expect(chordPitchClasses("C/E")).toEqual({ root: 0, tones: [0, 4, 7] });
		expect(chordPitchClasses("D/F#")?.tones).toEqual([2, 6, 9]);
		expect(chordPitchClasses("C/Bb")?.tones).toEqual([0, 4, 7, 10]);
	});

	test("N.C. and words that are not chords are null", () => {
		expect(chordPitchClasses("N.C.")).toBeNull();
		expect(chordPitchClasses("Chorus")).toBeNull();
		expect(chordPitchClasses("Bed")).toBeNull();
		expect(chordPitchClasses("love")).toBeNull();
		expect(chordPitchClasses("")).toBeNull();
		expect(chordPitchClasses("%")).toBeNull();
	});
});
