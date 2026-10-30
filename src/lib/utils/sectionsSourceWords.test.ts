import { describe, expect, test } from "vite-plus/test";
import { sectionsSourceWords } from "./sectionsSourceWords.js";

describe("sectionsSourceWords", () => {
	test("placed from the chart", () => {
		expect(sectionsSourceWords("chart", true)).toEqual({ from: "the chart", ones: "placed" });
	});

	test("detected by the AI, with the chart when the song has one", () => {
		expect(sectionsSourceWords("ai", true)).toEqual({
			from: "the AI and the chart",
			ones: "detected",
		});
		expect(sectionsSourceWords("ai", false)).toEqual({ from: "the AI", ones: "detected" });
	});
});
