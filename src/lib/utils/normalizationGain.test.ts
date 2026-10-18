import { describe, expect, it } from "vite-plus/test";
import { normalizationGain } from "./normalizationGain";

describe("normalizationGain", () => {
	it("lifts a quiet mix to the target", () => {
		const g = normalizationGain({ integrated: -20, truePeak: -8 });
		expect(20 * Math.log10(g)).toBeCloseTo(6, 6);
	});
	it("stops at the true-peak ceiling when that comes first", () => {
		const g = normalizationGain({ integrated: -20, truePeak: -3 });
		expect(20 * Math.log10(g)).toBeCloseTo(2, 6);
	});
	it("turns a hot mix down", () => {
		const g = normalizationGain({ integrated: -8, truePeak: 0.5 });
		expect(20 * Math.log10(g)).toBeCloseTo(-6, 6);
	});
	it("leaves silence alone and takes another target", () => {
		expect(normalizationGain({ integrated: null, truePeak: -Infinity })).toBe(1);
		const g = normalizationGain({ integrated: -23, truePeak: -10 }, { lufs: -16, ceilingDbtp: -2 });
		expect(20 * Math.log10(g)).toBeCloseTo(7, 6);
	});
});
