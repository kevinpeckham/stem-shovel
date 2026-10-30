import { describe, expect, test } from "vite-plus/test";
import { chartBarSeconds } from "./chartBarSeconds.js";

describe("chartBarSeconds", () => {
	test("the numerator's beats at the bpm; 6/8 counts eighths", () => {
		expect(chartBarSeconds("4/4", 120)).toBe(2);
		expect(chartBarSeconds("3/4", 60)).toBe(3);
		expect(chartBarSeconds("6/8", 120)).toBe(3);
	});

	test("an unreadable meter counts four", () => {
		expect(chartBarSeconds("", 120)).toBe(2);
		expect(chartBarSeconds("0/4", 120)).toBe(2);
	});
});
