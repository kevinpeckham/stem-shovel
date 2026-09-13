import { describe, expect, test } from "vite-plus/test";
import { formatTimecode } from "./formatTimecode";
import { parseTimecode } from "./parseTimecode";

describe("timecode (Logic's mm:ss:ff.sub, 80 subframes a frame)", () => {
	test("formats frames and subframes at the frame rate", () => {
		expect(formatTimecode(0, 25)).toBe("00:00:00.00");
		expect(formatTimecode(123.636, 25)).toBe("02:03:15.72");
		expect(formatTimecode(15.5, 30)).toBe("00:15:15.00");
	});
	test("adds hours when needed", () => {
		expect(formatTimecode(3661.5, 25)).toBe("01:01:01:12.40");
	});
	test("parses back to seconds", () => {
		expect(parseTimecode("02:03:15.72", 25)).toBeCloseTo(123.636, 3);
		expect(parseTimecode("01:30:00.00", 25)).toBe(90);
		expect(parseTimecode("01:00:01:23.10", 25)).toBeCloseTo(3601.925, 3);
		expect(parseTimecode("00:10:00", 25)).toBe(10);
	});
	test("round-trips", () => {
		for (const s of [0, 1.5, 88.25, 123.636, 256.74]) {
			expect(parseTimecode(formatTimecode(s, 25), 25)).toBeCloseTo(s, 2);
		}
	});
	test("rejects frames or subframes past the rate", () => {
		expect(parseTimecode("00:01:25.00", 25)).toBeNull();
		expect(parseTimecode("00:01:30.00", 25)).toBeNull();
		expect(parseTimecode("00:01:00.80", 25)).toBeNull();
		expect(parseTimecode("1:23.4", 25)).toBeNull();
	});
});
