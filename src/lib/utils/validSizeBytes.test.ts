import { describe, expect, it } from "vite-plus/test";
import { validSizeBytes } from "./validSizeBytes";

describe("validSizeBytes", () => {
	it("accepts whole bytes from one to the cap", () => {
		expect(validSizeBytes(1, 100)).toBe(true);
		expect(validSizeBytes(100, 100)).toBe(true);
	});
	it("refuses zero, negatives, fractions, NaN, infinity, strings and anything over the cap", () => {
		for (const v of [0, -5, 1.5, NaN, Infinity, "10", null, undefined, 101])
			expect(validSizeBytes(v, 100)).toBe(false);
	});
});
