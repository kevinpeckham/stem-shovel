import { describe, expect, it } from "vite-plus/test";
import type { TimingMap } from "@barmark/sync";
import { timingMapLine } from "./timingMapLine";

const map = (n: number, source?: string): TimingMap => ({
	format: "barmark-timing",
	version: 1,
	chart: { bars: n, hash: "h" },
	source,
	bars: Array.from({ length: n }, (_, i) => ({ bar: i + 1, start: i * 2 })),
	end: n * 2,
});

describe("timingMapLine", () => {
	it("says where the map came from and how many bars it holds", () => {
		expect(timingMapLine(map(78, "aligned"))).toBe("78 bars from the aligned chart.");
		expect(timingMapLine(map(78, "detected"))).toBe("78 bars from the detected chords.");
		expect(timingMapLine(map(1, "tapped"))).toBe("1 bar on the chart's timing map.");
	});
	it("sets an aligned map's bar 1 and bars beside the declared bar", () => {
		expect(timingMapLine(map(80, "aligned"), { barSeconds: (60 / 132) * 4 })).toBe(
			"80 bars from the aligned chart: bar 1 at 0:00, bars 2.0 s (the tempo says 1.82 s).",
		);
		const late: TimingMap = {
			...map(3, "aligned"),
			bars: [8.06, 9, 10.5].map((start, i) => ({ bar: i + 1, start })),
			end: 12,
		};
		expect(timingMapLine(late, { barSeconds: 1.5 })).toBe(
			"3 bars from the aligned chart: bar 1 at 0:08, bars 1.5 s (the tempo says 1.50 s).",
		);
		expect(timingMapLine(map(80, "aligned"), null)).toBe("80 bars from the aligned chart.");
		expect(timingMapLine(map(80, "detected"), { barSeconds: 2 })).toBe(
			"80 bars from the detected chords.",
		);
	});
	it("says how to make one when there is none", () => {
		expect(timingMapLine(null)).toBe(
			"No timing map yet: draft a chart from the detected chords, or place the chart from the stems.",
		);
	});
});
