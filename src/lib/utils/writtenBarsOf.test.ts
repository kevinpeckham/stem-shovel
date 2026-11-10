import { describe, expect, it } from "vite-plus/test";
import { writtenBarsOf } from "./writtenBarsOf";

describe("writtenBarsOf", () => {
	it("numbers a plain chart's bars in order", () => {
		expect(writtenBarsOf("| C | G | Am | F |")).toEqual([1, 2, 3, 4]);
	});

	it("a pickup is bar 0, the first full bar 1 (barmark 0.22, grammar 2.4)", () => {
		expect(writtenBarsOf("time: 4/4\n| [1/4] D |\n| G | A | D |")).toEqual([0, 1, 2, 3]);
		// A repeat that plays the pickup again shows 0 again.
		expect(writtenBarsOf("|: [1/4] D | G :|\n| A |")).toEqual([0, 1, 0, 1, 2]);
	});
	it("plays a repeat's bars again under their written numbers", () => {
		expect(writtenBarsOf("|: C | G :|\n| Am |")).toEqual([1, 2, 1, 2, 3]);
	});

	it("is null for a chart that plays no bar", () => {
		expect(writtenBarsOf("")).toBeNull();
	});
});
