import { describe, expect, it } from "vite-plus/test";
import { swingOfPercent } from "./swingOfPercent";
import { swingPercentOf } from "./swingPercentOf";

describe("swingOfPercent", () => {
	it("maps 50% to 0 and 66.7% to 1", () => {
		expect(swingOfPercent(50)).toBe(0);
		expect(swingOfPercent(58.3)).toBeCloseTo(0.5, 2);
		expect(swingOfPercent(66.7)).toBe(1);
	});

	it("clamps past the triplet feel to 1 and below straight to 0", () => {
		expect(swingOfPercent(75)).toBe(1);
		expect(swingOfPercent(40)).toBe(0);
	});

	it("inverts swingPercentOf within rounding", () => {
		for (const s of [0, 0.1, 0.15, 0.2, 0.25, 0.5, 0.75, 1])
			expect(swingOfPercent(swingPercentOf(s))).toBeCloseTo(s, 2);
	});
});
