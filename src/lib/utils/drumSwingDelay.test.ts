import { describe, expect, test } from "vite-plus/test";
import { drumSwingDelay } from "./drumSwingDelay";

describe("drumSwingDelay", () => {
	const step = 0.125; // a sixteenth at 120 bpm
	test("nothing moves at zero swing", () => {
		for (let s = 0; s < 16; s++) expect(drumSwingDelay(s, step, 0)).toBe(0);
	});
	test("the odd sixteenths land late, the eighths never move", () => {
		for (let s = 0; s < 16; s++) {
			expect(drumSwingDelay(s, step, 1)).toBeCloseTo(s % 2 === 1 ? step / 3 : 0);
		}
	});
	test("half swing is half the delay", () => {
		expect(drumSwingDelay(1, step, 0.5)).toBeCloseTo(step / 6);
		expect(drumSwingDelay(3, step, 0.5)).toBeCloseTo(step / 6);
	});
});
