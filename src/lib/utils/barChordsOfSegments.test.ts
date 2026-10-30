import { describe, expect, test } from "vite-plus/test";
import { barChordsOfSegments } from "./barChordsOfSegments.js";

describe("barChordsOfSegments", () => {
	test("spreads each run over the bars it holds", () => {
		expect(
			barChordsOfSegments(
				[
					{ bar: 1, bars: 2, chord: "D" },
					{ bar: 3, bars: 1, chord: "A" },
				],
				3,
			),
		).toEqual(["D", "D", "A"]);
	});
	test("a bar no run covers is empty", () => {
		expect(barChordsOfSegments([{ bar: 2, bars: 1, chord: "G" }], 3)).toEqual(["", "G", ""]);
	});
	test("runs past the bar count are cut off", () => {
		expect(barChordsOfSegments([{ bar: 1, bars: 5, chord: "C" }], 2)).toEqual(["C", "C"]);
	});
	test("no bars, no chords", () => {
		expect(barChordsOfSegments([{ bar: 1, bars: 1, chord: "C" }], 0)).toEqual([]);
	});
});
