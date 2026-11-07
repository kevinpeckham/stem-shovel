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
	it("says how to make one when there is none", () => {
		expect(timingMapLine(null)).toBe(
			"No timing map yet: draft a chart from the detected chords, or place the chart from the stems.",
		);
	});
});
