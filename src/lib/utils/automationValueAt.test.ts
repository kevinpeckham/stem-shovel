import { describe, expect, it } from "vite-plus/test";
import { automationValueAt } from "./automationValueAt";

describe("automationValueAt", () => {
	const lane = [
		{ t: 1, v: 0 },
		{ t: 3, v: 1 },
		{ t: 3, v: 0.5 },
		{ t: 5, v: 0.5 },
	];
	it("is the fallback with no points", () => {
		expect(automationValueAt([], 2, 0.7)).toBe(0.7);
	});
	it("holds the first value before the lane and the last after it", () => {
		expect(automationValueAt(lane, 0, 0)).toBe(0);
		expect(automationValueAt(lane, 1, 0)).toBe(0);
		expect(automationValueAt(lane, 9, 2)).toBe(0.5);
	});
	it("interpolates between neighbors and steps at a repeated time", () => {
		expect(automationValueAt(lane, 2, 0)).toBeCloseTo(0.5, 9);
		expect(automationValueAt(lane, 2.5, 0)).toBeCloseTo(0.75, 9);
		// At 3 the later of the two points wins: a step.
		expect(automationValueAt(lane, 3, 0)).toBe(0.5);
		expect(automationValueAt(lane, 4, 0)).toBe(0.5);
	});
	it("holds each value to the next point on a stepped lane", () => {
		expect(automationValueAt(lane, 2, 0, true)).toBe(0);
		expect(automationValueAt(lane, 2.99, 0, true)).toBe(0);
		expect(automationValueAt(lane, 3, 0, true)).toBe(0.5);
		expect(automationValueAt(lane, 4, 0, true)).toBe(0.5);
		expect(automationValueAt(lane, 0, 0.9, true)).toBe(0);
	});
	it("handles one point", () => {
		expect(automationValueAt([{ t: 2, v: 0.3 }], 0, 0)).toBe(0.3);
		expect(automationValueAt([{ t: 2, v: 0.3 }], 5, 0)).toBe(0.3);
	});
});
