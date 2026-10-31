import { describe, expect, it } from "vite-plus/test";
import { stripSectionNumerals } from "./stripSectionNumerals.js";

describe("stripSectionNumerals", () => {
	it("drops a roman numeral and its separator from a heading, keeping a repeat and the body", () => {
		expect(
			stripSectionNumerals(
				"## I - Intro\n| D |\n\n## II - Verse x2\n| A |\n\n## IV. Bridge\n## V: Solo",
			),
		).toBe("## Intro\n| D |\n\n## Verse x2\n| A |\n\n## Bridge\n## Solo");
	});
	it("leaves headings without a numeral, a name that is a numeral alone, and other lines as they are", () => {
		const chart = "## Verse\n## II\n| D - A |\nI - text line\nkey: D";
		expect(stripSectionNumerals(chart)).toBe(chart);
	});
});
