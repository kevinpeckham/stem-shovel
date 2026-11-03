import { describe, expect, it } from "vite-plus/test";
import { swingPercentOf } from "./swingPercentOf";

describe("swingPercentOf", () => {
	it("puts the off-beat from 50% (straight) to 66.7% (a triplet feel), one decimal", () => {
		expect(swingPercentOf(0)).toBe(50);
		expect(swingPercentOf(0.1)).toBe(51.7);
		expect(swingPercentOf(0.25)).toBe(54.2);
		expect(swingPercentOf(0.5)).toBe(58.3);
		expect(swingPercentOf(1)).toBe(66.7);
	});

	it("clamps an amount outside 0..1", () => {
		expect(swingPercentOf(-1)).toBe(50);
		expect(swingPercentOf(2)).toBe(66.7);
	});
});
