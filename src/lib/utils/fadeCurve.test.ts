import { describe, expect, it } from "vite-plus/test";
import { fadeCurve } from "./fadeCurve";

describe("fadeCurve", () => {
	it("runs a linear fade from 0 to the peak, and back", () => {
		const up = fadeCurve("linear", "in", 0.5, 5);
		expect([...up]).toEqual([0, 0.125, 0.25, 0.375, 0.5]);
		const down = fadeCurve("linear", "out", 0.5, 5);
		expect([...down]).toEqual([0.5, 0.375, 0.25, 0.125, 0]);
	});
	it("an equal-power pair sums to a steady power", () => {
		const up = fadeCurve("power", "in", 1, 33);
		const down = fadeCurve("power", "out", 1, 33);
		expect(up[0]).toBe(0);
		expect(up[32]).toBeCloseTo(1, 6);
		expect(down[0]).toBe(1);
		expect(down[32]).toBeCloseTo(0, 6);
		for (let i = 0; i < 33; i++) expect(up[i]! ** 2 + down[i]! ** 2).toBeCloseTo(1, 6);
		// Halfway, each sits at −3 dB rather than the linear −6.
		expect(up[16]).toBeCloseTo(Math.SQRT1_2, 6);
	});
	it("never has fewer than two points", () => {
		expect(fadeCurve("linear", "in", 1, 1)).toHaveLength(2);
	});
});
