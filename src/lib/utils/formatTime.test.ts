import { describe, expect, test } from "vite-plus/test";
import { formatTime } from "./formatTime";
import { parseTime } from "./parseTime";

describe("formatTime", () => {
	test("zero decimals gives m:ss", () => {
		expect(formatTime(44, 0)).toBe("0:44");
		expect(formatTime(4, 0)).toBe("0:04");
		expect(formatTime(83.6, 0)).toBe("1:24");
	});
	test("m:ss.s, tenths by default", () => {
		expect(formatTime(0)).toBe("0:00.0");
		expect(formatTime(83.4)).toBe("1:23.4");
		expect(formatTime(256.74)).toBe("4:16.7");
	});
	test("more decimals for editors", () => {
		expect(formatTime(88.25, 3)).toBe("1:28.250");
		expect(formatTime(5, 3)).toBe("0:05.000");
	});
	test("never negative", () => {
		expect(formatTime(-3)).toBe("0:00.0");
	});
});

describe("parseTime", () => {
	test("accepts what the transport shows, plus plain seconds and hours", () => {
		expect(parseTime("1:23.4")).toBe(83.4);
		expect(parseTime("1:23")).toBe(83);
		expect(parseTime("83")).toBe(83);
		expect(parseTime("83.5")).toBe(83.5);
		expect(parseTime("1:02:03.4")).toBeCloseTo(3723.4);
		expect(parseTime(" 0:05.0 ")).toBe(5);
	});
	test("rejects non-times and out-of-range parts", () => {
		expect(parseTime("nope")).toBeNull();
		expect(parseTime("1:75")).toBeNull();
		expect(parseTime("")).toBeNull();
		expect(parseTime("1:2:3:4")).toBeNull();
		expect(parseTime("-5")).toBeNull();
	});
});
