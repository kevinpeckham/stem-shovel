import { describe, expect, it } from "vite-plus/test";
import { arpSwingDelay } from "./arpSwingDelay";

describe("arpSwingDelay", () => {
	it("pushes the odd steps late by up to a third of a step", () => {
		expect(arpSwingDelay(0, 0.25, 1, 2)).toBe(0);
		expect(arpSwingDelay(1, 0.25, 1, 2)).toBeCloseTo(0.25 / 3);
		expect(arpSwingDelay(3, 0.125, 0.5, 4)).toBeCloseTo(0.125 / 6);
		expect(arpSwingDelay(1, 0.25, 0, 2)).toBe(0);
	});
	it("leaves quarter notes and triplets straight", () => {
		expect(arpSwingDelay(1, 0.5, 1, 1)).toBe(0);
		expect(arpSwingDelay(1, 0.1667, 1, 3)).toBe(0);
	});
});
