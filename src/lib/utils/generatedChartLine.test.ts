import { describe, expect, test } from "vite-plus/test";
import { generatedChartLine } from "./generatedChartLine";

describe("generatedChartLine", () => {
	test("bars, sections and the placed start and tempo", () => {
		expect(generatedChartLine({ bars: 78, sections: 6, placed: { startAt: 0, bpm: 132 } })).toBe(
			"Chart generated from the stems: 78 bars, 6 sections; start of bar 1 set to 0:00.0 and tempo to 132 bpm.",
		);
	});

	test("a start placed without a tempo (the tracker's first downbeat)", () => {
		expect(generatedChartLine({ bars: 72, sections: 4, placed: { startAt: 1.02 } })).toBe(
			"Chart generated from the stems: 72 bars, 4 sections; start of bar 1 set to 0:01.0.",
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

	test("the verdict's notes follow, joined", () => {
		expect(
			generatedChartLine({
				bars: 78,
				sections: 0,
				placed: null,
				notes: ["bar 1 was not placed from the stems", "2 warnings on the chart"],
			}),
		).toBe(
			"Chart generated from the stems: 78 bars, no sections. Note: bar 1 was not placed from the stems; 2 warnings on the chart.",
		);
		expect(generatedChartLine({ bars: 1, sections: 0, placed: null, notes: [] })).toBe(
			"Chart generated from the stems: 1 bar, no sections.",
		);
	});
});
