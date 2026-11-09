import { describe, expect, it } from "vite-plus/test";
import { writtenBarsOf } from "./writtenBarsOf";

describe("writtenBarsOf", () => {
	it("numbers a plain chart's bars in order", () => {
		expect(writtenBarsOf("| C | G | Am | F |")).toEqual([1, 2, 3, 4]);
	});

	it("plays a repeat's bars again under their written numbers", () => {
		expect(writtenBarsOf("|: C | G :|\n| Am |")).toEqual([1, 2, 1, 2, 3]);
	});

	it("is null for a chart that plays no bar", () => {
		expect(writtenBarsOf("")).toBeNull();
	});
});
