import { describe, expect, test } from "vite-plus/test";
import { excerpt } from "./excerpt";

describe("excerpt", () => {
	test("skips the heading and strips markdown", () => {
		expect(
			excerpt("# Title\n\nStem Shovel is a **place** for [bands](/x) to keep *stems*.\n\nMore."),
		).toBe("Stem Shovel is a place for bands to keep stems.");
	});
	test("cuts at a word with an ellipsis", () => {
		const long = "word ".repeat(60).trim();
		const out = excerpt(`# T\n\n${long}`, 40);
		expect(out.length).toBeLessThanOrEqual(41);
		expect(out.endsWith("…")).toBe(true);
	});
	test("nothing to say", () => {
		expect(excerpt("# Only a heading")).toBe("");
	});
});
