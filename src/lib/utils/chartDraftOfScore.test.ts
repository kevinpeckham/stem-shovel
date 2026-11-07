import { describe, expect, it } from "vite-plus/test";
import { chartDraftOfScore } from "./chartDraftOfScore";

describe("chartDraftOfScore", () => {
	it("a score's chart as a draft: no chords, sections or progressions, its name and diagnostics", () => {
		const diagnostics = [{ level: "warning" as const, message: "Lyrics were left out." }];
		expect(
			chartDraftOfScore(
				{ chart: "| C | G |", chartHtml: "<barmark-chart></barmark-chart>", diagnostics },
				"Lead sheet",
			),
		).toEqual({
			chords: "",
			sections: [],
			progressions: [],
			notes: "",
			chart: "| C | G |",
			chartHtml: "<barmark-chart></barmark-chart>",
			source: "score",
			scoreName: "Lead sheet",
			diagnostics,
		});
	});
});
