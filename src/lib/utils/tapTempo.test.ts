import { describe, expect, test } from "vite-plus/test";
import { tapTempo } from "./tapTempo";

describe("tapTempo", () => {
	test("needs two taps", () => {
		expect(tapTempo([])).toBeNull();
		expect(tapTempo([1000])).toBeNull();
	});
	test("reads the average gap as beats per minute", () => {
		expect(tapTempo([0, 500, 1000, 1500])).toBe(120);
		expect(tapTempo([0, 600, 1200])).toBe(100);
		expect(tapTempo([0, 480, 1020, 1500])).toBe(120);
	});
	test("a long pause starts over", () => {
		expect(tapTempo([0, 500, 1000, 9000])).toBeNull();
		expect(tapTempo([0, 500, 1000, 9000, 9750])).toBe(80);
	});
	test("stays within the metronome's range", () => {
		expect(tapTempo([0, 100, 200])).toBe(300);
		expect(tapTempo([0, 1900, 3800])).toBe(32);
	});
});
