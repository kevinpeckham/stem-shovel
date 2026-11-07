import { describe, expect, it } from "vite-plus/test";
import { chartHash } from "@barmark/sync";
import { alignedTimingMap } from "./alignedTimingMap";

const TEXT = "## Verse\n| C | G | Am |\n";

describe("alignedTimingMap", () => {
	it("a start per played bar and the end, hashed to the chart, source aligned", () => {
		expect(alignedTimingMap(TEXT, 3, [0.4, 2.4, 4.5, 6.5], 60)).toEqual({
			format: "barmark-timing",
			version: 1,
			chart: { bars: 3, hash: chartHash(TEXT) },
			recording: { duration: 60 },
			source: "aligned",
			bars: [
				{ bar: 1, start: 0.4 },
				{ bar: 2, start: 2.4 },
				{ bar: 3, start: 4.5 },
			],
			end: 6.5,
		});
	});
	it("null when the starts do not check against the chart or run short", () => {
		expect(alignedTimingMap(TEXT, 3, [0.4, 0.2, 4.5, 6.5], 60)).toBeNull();
		expect(alignedTimingMap(TEXT, 2, [0, 2, 4], 60)).toBeNull();
		expect(alignedTimingMap(TEXT, 3, [0, 2, 4], 60)).toBeNull();
		expect(alignedTimingMap(TEXT, 0, [0], 60)).toBeNull();
	});
});
