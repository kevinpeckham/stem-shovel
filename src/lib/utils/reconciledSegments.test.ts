import { describe, expect, test } from "vite-plus/test";
import { reconciledSegments } from "./reconciledSegments.js";

const detected = [
	{ bar: 1, bars: 2, start: 0, chord: "D", confidence: 0.8 },
	{ bar: 3, bars: 1, start: 4, chord: "F#m", confidence: 0.4 },
	{ bar: 4, bars: 1, start: 6, chord: "G", confidence: 0.6 },
];

describe("reconciledSegments", () => {
	test("an unchanged answer gives the detector's runs back", () => {
		expect(reconciledSegments(detected, ["D", "D", "F#m", "G"])).toEqual({
			segments: detected,
			changed: 0,
		});
	});
	test("a corrected bar joins its neighbor's run, with the mean of their confidences", () => {
		expect(reconciledSegments(detected, ["D", "D", "D", "G"])).toEqual({
			segments: [
				{ bar: 1, bars: 3, start: 0, chord: "D", confidence: (0.8 + 0.8 + 0.4) / 3 },
				{ bar: 4, bars: 1, start: 6, chord: "G", confidence: 0.6 },
			],
			changed: 1,
		});
	});
	test("splitting a run starts the new one where its bar does", () => {
		expect(reconciledSegments(detected, ["D", "Bm", "F#m", "G"]).segments).toEqual([
			{ bar: 1, bars: 1, start: 0, chord: "D", confidence: 0.8 },
			{ bar: 2, bars: 1, start: 2, chord: "Bm", confidence: 0.8 },
			{ bar: 3, bars: 1, start: 4, chord: "F#m", confidence: 0.4 },
			{ bar: 4, bars: 1, start: 6, chord: "G", confidence: 0.6 },
		]);
	});
	test("symbols are compared trimmed, and N.C. equals an empty detection", () => {
		const silent = [{ bar: 1, bars: 2, start: 0, chord: "", confidence: 0 }];
		expect(reconciledSegments(silent, [" N.C. ", ""]).changed).toBe(0);
		expect(reconciledSegments(detected, [" D", "D ", "F#m", "G"]).changed).toBe(0);
	});
	test("an empty answer for a bar reads as N.C.", () => {
		expect(reconciledSegments(detected, ["D", "D", "F#m", ""]).segments.at(-1)).toEqual({
			bar: 4,
			bars: 1,
			start: 6,
			chord: "N.C.",
			confidence: 0.6,
		});
	});
	test("bars past the end of the answer keep the detector's chord", () => {
		expect(reconciledSegments(detected, ["D", "D"])).toEqual({ segments: detected, changed: 0 });
	});
	test("the last run's later bars are spaced like the rest of the song", () => {
		const tail = [
			{ bar: 1, bars: 1, start: 0, chord: "C", confidence: 1 },
			{ bar: 2, bars: 2, start: 2, chord: "G", confidence: 1 },
		];
		expect(reconciledSegments(tail, ["C", "G", "Am"]).segments.at(-1)?.start).toBe(4);
	});
});
