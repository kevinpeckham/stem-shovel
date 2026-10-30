import { describe, expect, test } from "vite-plus/test";
import { isTripleMeter } from "./isTripleMeter.js";

describe("isTripleMeter", () => {
	test("three to the bar", () => {
		for (const m of ["3/4", "3/8", "3/2", " 3 / 4 "]) {
			expect(isTripleMeter(m)).toBe(true);
		}
	});
	test("compound, duple, garbage and missing are not", () => {
		for (const m of ["6/8", "9/8", "4/4", "2/4", "12/8", "", "3", "x/4", "3/x", null, undefined]) {
			expect(isTripleMeter(m)).toBe(false);
		}
	});
});
