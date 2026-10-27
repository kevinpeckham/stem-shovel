import { describe, expect, test } from "vite-plus/test";
import { formatWhen } from "./formatWhen";

describe("formatWhen", () => {
	test("the day, then the time in lower case", () => {
		expect(formatWhen(new Date(2026, 8, 13, 19, 5))).toBe("Sep 13, 2026 7:05 pm");
	});
	test("morning", () => {
		expect(formatWhen(new Date(2026, 0, 2, 9, 30))).toBe("Jan 2, 2026 9:30 am");
	});
});
