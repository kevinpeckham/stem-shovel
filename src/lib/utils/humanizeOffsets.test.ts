import { describe, expect, it } from "vite-plus/test";
import { humanizeOffsets } from "./humanizeOffsets";

describe("humanizeOffsets", () => {
	it("is exact at 0 and draws nothing", () => {
		let draws = 0;
		const random = () => (draws++, 1);
		expect(humanizeOffsets(0, random)).toEqual({ seconds: 0, velocity: 0 });
		expect(humanizeOffsets(-1, random)).toEqual({ seconds: 0, velocity: 0 });
		expect(draws).toBe(0);
	});
	it("reaches 30 ms and 0.2 either way at full", () => {
		const high = humanizeOffsets(1, () => 1);
		expect(high.seconds).toBeCloseTo(0.03);
		expect(high.velocity).toBeCloseTo(0.2);
		const low = humanizeOffsets(1, () => 0);
		expect(low.seconds).toBeCloseTo(-0.03);
		expect(low.velocity).toBeCloseTo(-0.2);
	});
	it("scales with the amount and clamps above 1", () => {
		expect(humanizeOffsets(0.5, () => 1).seconds).toBeCloseTo(0.015);
		expect(humanizeOffsets(3, () => 1)).toEqual(humanizeOffsets(1, () => 1));
	});
});
