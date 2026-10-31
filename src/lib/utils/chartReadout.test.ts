import { describe, expect, it } from "vite-plus/test";
import { chartReadout } from "./chartReadout.js";

const SONG = { tempo: 120, meter: "4/4" };
const NONE = { tempo: null, meter: null };

describe("chartReadout", () => {
	it("is null for a blank chart", () => {
		expect(chartReadout("", SONG)).toBeNull();
		expect(chartReadout("  \n\n ", SONG)).toBeNull();
	});
	it("asks for a tempo when neither the chart nor the song has one", () => {
		expect(chartReadout("| D | A | Bm | G |", NONE)).toEqual({
			summary: "No tempo: add one to the chart or the song's settings",
			warnings: [],
		});
	});
	it("takes the chart's own tempo when the song has none", () => {
		expect(chartReadout("120 bpm\n\n| D | A | Bm | G |", NONE)?.summary).toBe(
			"4 bars · no sections · 0:08",
		);
	});
	it("says no bars read when there is a tempo but nothing parses", () => {
		expect(chartReadout("Just some words about the song.", SONG)).toEqual({
			summary: "No bars read",
			warnings: [],
		});
	});
	it("counts bars, sections and the length", () => {
		const chart = "## Verse\n\n| D | A | Bm | G |\n\n## Chorus\n\n| G | A | x2";
		// 8 bars of 4/4 at 120: two seconds each.
		expect(chartReadout(chart, SONG)).toEqual({
			summary: "8 bars · 2 sections · 0:16",
			warnings: [],
		});
	});
	it("uses the singular forms", () => {
		expect(chartReadout("## Intro\n\n| D |", { tempo: 60, meter: "4/4" })?.summary).toBe(
			"1 bar · 1 section · 0:04",
		);
	});
	it("passes the parser's warnings through", () => {
		const read = chartReadout("| A5 riff | D |", SONG);
		expect(read?.summary).toBe("2 bars · no sections · 0:04");
		expect(read?.warnings.length).toBeGreaterThan(0);
	});
});
