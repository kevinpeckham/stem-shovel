import { describe, expect, it } from "vite-plus/test";
import { loudnessFromPeaks, relativeLoudness } from "./stemLoudness";

describe("loudnessFromPeaks", () => {
	it("is the mean of the bins above the silence floor, in dB", () => {
		expect(loudnessFromPeaks([1, 1, 1])).toBeCloseTo(0, 9);
		expect(loudnessFromPeaks([0.5, 0.5, 0, 0])).toBeCloseTo(20 * Math.log10(0.5), 9);
		expect(loudnessFromPeaks([0.25, 0.75, 0.0001])).toBeCloseTo(20 * Math.log10(0.5), 9);
	});
	it("is null without peaks or with silence only", () => {
		expect(loudnessFromPeaks(undefined)).toBeNull();
		expect(loudnessFromPeaks([])).toBeNull();
		expect(loudnessFromPeaks([0, 0.0001])).toBeNull();
	});
});

describe("relativeLoudness", () => {
	it("puts the loudest at 0 and the rest below, unknowns at 0", () => {
		const rel = relativeLoudness(
			new Map([
				["a", -6],
				["b", -18],
				["c", null],
			]),
		);
		expect(rel.get("a")).toBe(0);
		expect(rel.get("b")).toBe(-12);
		expect(rel.get("c")).toBe(0);
	});
	it("is all zero when nothing is known", () => {
		const rel = relativeLoudness(new Map([["a", null]]));
		expect(rel.get("a")).toBe(0);
	});
});
