import { describe, expect, test } from "vite-plus/test";
import { chordsByBarSummary } from "./chordsByBarSummary.js";

const segments = [
	{ bars: 3, confidence: 0.5 },
	{ bars: 1, confidence: 0.9 },
];

describe("chordsByBarSummary", () => {
	test("the matcher's confidence, weighted by bars", () => {
		expect(chordsByBarSummary(segments, null)).toBe("Chords by bar (4 bars, 60% sure on average)");
	});
	test("the AI's corrections once it checked them", () => {
		expect(chordsByBarSummary(segments, 3)).toBe(
			"Chords by bar (4 bars, 3 corrected by the AI from the notes)",
		);
		expect(chordsByBarSummary(segments, 0)).toBe(
			"Chords by bar (4 bars, 0 corrected by the AI from the notes)",
		);
	});
	test("one correction names the bar", () => {
		expect(chordsByBarSummary(segments, 1)).toBe(
			"Chords by bar (4 bars, 1 bar corrected by the AI from the notes)",
		);
	});
	test("one bar is singular", () => {
		expect(chordsByBarSummary([{ bars: 1, confidence: 1 }], null)).toBe(
			"Chords by bar (1 bar, 100% sure on average)",
		);
	});
});
