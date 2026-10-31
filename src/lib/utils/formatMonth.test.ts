import { describe, expect, test } from "vite-plus/test";
import { formatMonth } from "./formatMonth";

describe("formatMonth", () => {
	test("month and year from an ISO date", () => {
		expect(formatMonth("2019-06-15")).toBe("June 2019");
	});
	test("returns the input when it is not a date", () => {
		expect(formatMonth("soon")).toBe("soon");
	});
});
