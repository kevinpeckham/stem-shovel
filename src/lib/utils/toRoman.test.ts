import { describe, expect, test } from "vite-plus/test";
import { formatBytes } from "./formatBytes";
import { formatMonth } from "./formatMonth";
import { toRoman } from "./toRoman";

describe("toRoman", () => {
	test("standard numerals", () => {
		expect([1, 2, 3, 4, 5, 9, 10, 14, 40, 99, 1994].map(toRoman)).toEqual([
			"I",
			"II",
			"III",
			"IV",
			"V",
			"IX",
			"X",
			"XIV",
			"XL",
			"XCIX",
			"MCMXCIV",
		]);
	});
	test("falls back to the number outside 1–3999 or for non-integers", () => {
		expect(toRoman(0)).toBe("0");
		expect(toRoman(4000)).toBe("4000");
		expect(toRoman(2.5)).toBe("2.5");
	});
});

describe("formatBytes", () => {
	test("KB below a megabyte, MB with one decimal above", () => {
		expect(formatBytes(48945)).toBe("48 KB");
		expect(formatBytes(10485760)).toBe("10.0 MB");
	});
});

describe("formatMonth", () => {
	test("month and year from an ISO date", () => {
		expect(formatMonth("2019-06-15")).toBe("June 2019");
	});
	test("returns the input when it is not a date", () => {
		expect(formatMonth("soon")).toBe("soon");
	});
});
