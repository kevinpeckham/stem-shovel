import { describe, expect, it } from "vite-plus/test";
import { snapToStep } from "./snapToStep";

describe("snapToStep", () => {
	it("rounds to the nearest step counted from the minimum", () => {
		expect(snapToStep(0.37, 0, 1, 0.05)).toBe(0.35);
		expect(snapToStep(0.38, 0, 1, 0.05)).toBe(0.4);
		expect(snapToStep(-0.47, -1, 1, 0.05)).toBe(-0.45);
	});
	it("clamps to the range, either way round", () => {
		expect(snapToStep(2, 0, 1.25, 0.01)).toBe(1.25);
		expect(snapToStep(-3, -1, 1, 0.05)).toBe(-1);
		expect(snapToStep(5, 10, 0, 1)).toBe(5);
	});
	it("tidies floating-point noise to the step's decimals", () => {
		expect(snapToStep(0.1 + 0.2, 0, 1, 0.1)).toBe(0.3);
		expect(snapToStep(0.7, 0, 1, 0.01)).toBe(0.7);
	});
	it("only clamps for a step of zero", () => {
		expect(snapToStep(0.333, 0, 1, 0)).toBe(0.333);
	});
});
