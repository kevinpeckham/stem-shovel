import { describe, expect, it } from "vite-plus/test";
import { monoPan, monoPanCurves } from "./monoPan";

describe("monoPan", () => {
	it("sits at unity on both sides at center and loses the far side on a sine", () => {
		expect(monoPan(0)).toEqual({ left: 1, right: 1 });
		expect(monoPan(1).left).toBeCloseTo(0, 6);
		expect(monoPan(1).right).toBe(1);
		expect(monoPan(-1).right).toBeCloseTo(0, 6);
		expect(monoPan(-1).left).toBe(1);
		expect(monoPan(0.5).left).toBeCloseTo(Math.SQRT1_2, 6);
	});
	it("lays the law out as curves from hard left to hard right", () => {
		const { left, right } = monoPanCurves(5);
		expect(Array.from(left).map((v) => Math.round(v * 1000) / 1000)).toEqual([1, 1, 1, 0.707, 0]);
		expect(Array.from(right).map((v) => Math.round(v * 1000) / 1000)).toEqual([0, 0.707, 1, 1, 1]);
	});
});
