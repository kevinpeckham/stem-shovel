import { describe, expect, test } from "vite-plus/test";
import { generatedChartLine } from "./generatedChartLine";

describe("generatedChartLine", () => {
	test("bars, sections and the placed start and tempo", () => {
		expect(generatedChartLine({ bars: 78, sections: 6, placed: { startAt: 0, bpm: 132 } })).toBe(
			"Chart generated from the stems: 78 bars, 6 sections; start of bar 1 set to 0:00.0 and tempo to 132 bpm.",
		);
	});

	test("no sections, nothing placed", () => {
		expect(generatedChartLine({ bars: 78, sections: 0, placed: null })).toBe(
			"Chart generated from the stems: 78 bars, no sections.",
		);
	});

	test("one bar and one section are singular", () => {
		expect(generatedChartLine({ bars: 1, sections: 1, placed: { startAt: 83.4, bpm: 99.5 } })).toBe(
			"Chart generated from the stems: 1 bar, 1 section; start of bar 1 set to 1:23.4 and tempo to 99.5 bpm.",
		);
	});
});
