import { describe, expect, test } from "vite-plus/test";
import { formatDate } from "./formatDate";

describe("formatDate", () => {
	test("short month, day and year", () => {
		expect(formatDate(new Date(2026, 8, 13))).toBe("Sep 13, 2026");
	});
});
