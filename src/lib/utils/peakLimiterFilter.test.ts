import { describe, expect, it } from "vite-plus/test";
import { peakLimiterFilter } from "./peakLimiterFilter";

describe("peakLimiterFilter", () => {
	it("limits at -1 dBFS without auto-leveling, with a fast attack and release", () => {
		expect(peakLimiterFilter()).toBe("alimiter=limit=0.891:level=false:attack=5:release=50");
		expect(20 * Math.log10(0.891)).toBeCloseTo(-1, 1);
	});
});
