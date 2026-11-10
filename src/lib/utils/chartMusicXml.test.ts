import { describe, expect, it } from "vite-plus/test";
import { chartMusicXml } from "./chartMusicXml.js";

describe("chartMusicXml", () => {
	it("a chart with bars becomes a MusicXML score with chord symbols", () => {
		const xml = chartMusicXml(
			"# Song\nkey: C major\ntime: 4/4\ntempo: 120\n\n## Verse\n| C | F | G | C |",
			"Fallback",
		);
		expect(xml).toContain("<score-partwise");
		expect(xml).toContain("<harmony");
		expect(xml).toContain("<measure");
	});
	it("the title names a chart that has none of its own", () => {
		expect(chartMusicXml("| C | F |", "So What")).toContain("So What");
	});
	it("a chart whose MusicXML would pass the budget is null, and a budget that fits is honored", () => {
		const chart = "|: C | F | G | C :| x 8";
		expect(chartMusicXml(chart, "Song", 2_000)).toBeNull();
		expect(chartMusicXml(chart, "Song")).toContain("<measure");
	});
	it("a blank chart, one without bars and one with an error are null", () => {
		expect(chartMusicXml("", "Song")).toBeNull();
		expect(chartMusicXml("  \n ", "Song")).toBeNull();
		expect(chartMusicXml("Title: Song\nkey: F", "Song")).toBeNull();
		expect(chartMusicXml("| C | Hb |", "Song")).toBeNull();
	});
});
