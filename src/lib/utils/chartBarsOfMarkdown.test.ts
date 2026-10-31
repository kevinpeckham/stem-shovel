import { describe, expect, it } from "vite-plus/test";
import { chartBarsOfMarkdown } from "./chartBarsOfMarkdown.js";

const SONG = { tempo: 120, meter: "4/4" };
const LEGACY =
	"This chart is in the old notation and will be migrated to barmark; see /docs/writing-a-chord-chart";

/** The old in-app idiom: bold labels, unbarred lines and `x N` after a line (from the band's stored charts). */
const OLD_IDIOM = String.raw`**I - Part 1**
\| Em Am | x2

**II  - Part 2**
D5 | A7 | Em7 | Em7`;

describe("chartBarsOfMarkdown", () => {
	it("reads a barmark chart with barmark", () => {
		const read = chartBarsOfMarkdown("## Verse\n| D | A | Bm | G |", SONG);
		expect(read?.bars.map((b) => b.chords)).toEqual([["D"], ["A"], ["Bm"], ["G"]]);
		expect(read?.warnings).not.toContain(LEGACY);
	});
	it("falls back to the old parser for a chart in the old idiom, saying so", () => {
		const read = chartBarsOfMarkdown(OLD_IDIOM, SONG);
		expect(read?.bars.length).toBeGreaterThan(0);
		expect(read?.warnings[0]).toBe(LEGACY);
	});
	it("is null for a blank chart", () => {
		expect(chartBarsOfMarkdown("", SONG)).toBeNull();
		expect(chartBarsOfMarkdown("  \n", SONG)).toBeNull();
	});
});
