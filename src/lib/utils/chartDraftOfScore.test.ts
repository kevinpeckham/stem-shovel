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
			parts: [],
		});
	});

	it("the notation file, its parts and the part charted ride along", () => {
		const draft = chartDraftOfScore(
			{ chart: "", chartHtml: "", diagnostics: [], notationId: "score-1", parts: ["Piano"] },
			"Lead sheet",
		);
		expect(draft).toMatchObject({ notationId: "score-1", parts: ["Piano"] });
		expect(draft).not.toHaveProperty("partName");
		expect(
			chartDraftOfScore(
				{
					chart: "| {C E G} |",
					chartHtml: "<p>n</p>",
					diagnostics: [],
					parts: [],
					partName: "Piano",
				},
				"Lead sheet",
			),
		).toMatchObject({ partName: "Piano" });
	});
});
