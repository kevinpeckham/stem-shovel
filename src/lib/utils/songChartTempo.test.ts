import { describe, expect, it } from "vite-plus/test";
import { songChartTempo } from "./songChartTempo.js";

describe("songChartTempo", () => {
	it("the tempo at 0:00, in quarters for a simple meter or none", () => {
		expect(songChartTempo([{ kind: "tempo", start: 0, value: "96" }])).toBe(96);
		expect(
			songChartTempo([
				{ kind: "meter", start: 0, value: "3/4" },
				{ kind: "tempo", start: 0, value: "120" },
			]),
		).toBe(120);
	});
	it("a compound meter's eighths become dotted quarters", () => {
		expect(
			songChartTempo([
				{ kind: "meter", start: 0, value: "6/8" },
				{ kind: "tempo", start: 0, value: "120" },
			]),
		).toBe(40);
	});
	it("no tempo at 0:00, or one that does not read, is null", () => {
		expect(songChartTempo([])).toBeNull();
		expect(songChartTempo([{ kind: "tempo", start: 12, value: "100" }])).toBeNull();
		expect(songChartTempo([{ kind: "tempo", start: 0, value: "fast" }])).toBeNull();
	});
});
