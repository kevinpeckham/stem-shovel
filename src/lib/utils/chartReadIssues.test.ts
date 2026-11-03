import { describe, expect, it } from "vite-plus/test";
import { chartReadIssues } from "./chartReadIssues.js";

describe("chartReadIssues", () => {
	it("a clean read has none; a barmark warning is not shown", () => {
		expect(chartReadIssues("key: F, tempo: 120\n| F | C |")).toEqual([]);
		expect(chartReadIssues("| F | ? |")).toEqual([]);
	});
	it("barmark's errors with their line, token and suggestion, after the reader's notes", () => {
		expect(chartReadIssues("key: F\n| F | Xq7 |\n| F | C | 2x\nNote: page 2 is blurred")).toEqual([
			"The reader notes: page 2 is blurred",
			"Line 2: Xq7: a chord starts with a root A–G (Xq7)",
			"Line 3: a repeat is written x N after the final | (2x) → x2",
		]);
	});
	it("an error written twice on one line is shown once", () => {
		expect(chartReadIssues("| F | | |")).toHaveLength(1);
	});
});
