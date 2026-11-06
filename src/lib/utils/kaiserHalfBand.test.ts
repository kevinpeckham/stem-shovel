import { describe, expect, test } from "vite-plus/test";
import { kaiserHalfBand } from "./kaiserHalfBand";

describe("kaiserHalfBand", () => {
	const taps = kaiserHalfBand();
	test("has 255 taps summing to 1", () => {
		expect(taps.length).toBe(255);
		expect(taps.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
	});
	test("is symmetric about the middle tap, which is the largest", () => {
		for (let n = 0; n < 127; n++) expect(taps[n]).toBeCloseTo(taps[254 - n], 15);
		expect(Math.max(...taps)).toBe(taps[127]);
	});
});
