import { describe, expect, test } from "vite-plus/test";
import { beatThisPeaks } from "./beatThisPeaks";

const at = (values: number[]) => Float32Array.from(values);

describe("beatThisPeaks", () => {
	test("isolated peaks become seconds at 50 fps", () => {
		const logits = new Float32Array(100).fill(-5);
		logits[10] = 2;
		logits[60] = 1;
		expect(beatThisPeaks(logits)).toEqual([0.2, 1.2]);
	});
	test("a peak at or below 0 is ignored", () => {
		const logits = new Float32Array(30).fill(-5);
		logits[5] = 0;
		logits[20] = -1;
		expect(beatThisPeaks(logits)).toEqual([]);
	});
	test("a lower value within 3 frames of a higher one is not a peak", () => {
		expect(beatThisPeaks(at([0, 1, 0, 0, 3, 0, 0, 0, 0, 0]), 1)).toEqual([4]);
		// 4 frames away it is.
		expect(beatThisPeaks(at([1, 0, 0, 0, 3, 0, 0, 0, 0, 0]), 1)).toEqual([0, 4]);
	});
	test("a plateau of two equal maxima merges to its midpoint", () => {
		expect(beatThisPeaks(at([0, 0, 2, 2, 0, 0]), 1)).toEqual([2.5]);
	});
	test("the running-mean quirk: a plateau of four", () => {
		// Peaks 2, 3, 4, 5. p = 2; 3 − 2 ≤ 1: c 2, p 2.5; 4 − 2.5 > 1: emit 2.5,
		// p = 4; 5 − 4 ≤ 1: c 2, p 4.5. Result [2.5, 4.5].
		expect(beatThisPeaks(at([0, 0, 1, 1, 1, 1, 0, 0]), 1)).toEqual([2.5, 4.5]);
	});
	test("a plateau of three: 2, 3 → 2.5; 4 − 2.5 > 1 so 4 stands alone", () => {
		expect(beatThisPeaks(at([0, 0, 1, 1, 1, 0, 0]), 1)).toEqual([2.5, 4]);
	});
	test("peaks at the edges count (−∞ padding)", () => {
		expect(beatThisPeaks(at([3, 0, 0, 0, 0, 0, 0, 0, 0, 4]), 1)).toEqual([0, 9]);
	});
	test("empty logits, no peaks", () => {
		expect(beatThisPeaks(new Float32Array(0))).toEqual([]);
	});
});
