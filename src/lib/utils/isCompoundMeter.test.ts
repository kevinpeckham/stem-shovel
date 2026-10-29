import { describe, expect, test } from "vite-plus/test";
import { isCompoundMeter } from "./isCompoundMeter.js";

describe("isCompoundMeter", () => {
	test("compound meters", () => {
		for (const m of ["6/8", "9/8", "12/8", "6/16", "12/16", " 6 / 8 "]) {
			expect(isCompoundMeter(m)).toBe(true);
		}
	});
	test("simple, additive, empty and missing are not", () => {
		for (const m of ["3/4", "4/4", "3/8", "7/8", "6/4", "", "6", "x/8", null, undefined]) {
			expect(isCompoundMeter(m)).toBe(false);
		}
	});
});
