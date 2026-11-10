import { describe, expect, it } from "vite-plus/test";
import { chartScoreRefusal } from "./chartScoreRefusal.js";

describe("chartScoreRefusal", () => {
	it("a chart that exports, and a blank one, are null", () => {
		expect(chartScoreRefusal("# Song\ntime: 4/4\n| C | F | G | C |")).toBeNull();
		expect(chartScoreRefusal("")).toBeNull();
		expect(chartScoreRefusal("  \n ")).toBeNull();
	});
	it("an unreadable chord names its line", () => {
		expect(chartScoreRefusal("| C | G |\n| C | Qz7 |")).toBe(
			"Line 2: Qz7: a chord starts with a root A–G",
		);
	});
	it("an error about the whole chart is its message alone", () => {
		expect(chartScoreRefusal("# Title\nsome words")).toBe("the chart has no bars to export");
	});
	it("a chart past the budget is too large to draw", () => {
		expect(chartScoreRefusal("|: C | F | G | C :| x 8", 2_000)).toBe(
			"The score is too large to draw",
		);
	});
});
