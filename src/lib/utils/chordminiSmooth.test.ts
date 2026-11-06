import { describe, expect, test } from "vite-plus/test";
import { chordminiIndices } from "./chordminiSmooth";

/** Logits for `frames` frames of `classes` classes, each frame's winner given. */
function logitsOf(winners: number[], classes: number, strength = 1): Float32Array {
	const out = new Float32Array(winners.length * classes);
	winners.forEach((w, f) => (out[f * classes + w] = strength));
	return out;
}

describe("chordminiIndices", () => {
	test("smoothing flips a lone frame to its neighbors' class", () => {
		const winners = [0, 0, 0, 0, 1, 0, 0, 0, 0, 2, 2, 2, 2, 2, 2];
		const indices = chordminiIndices(logitsOf(winners, 3), winners.length, 3, 108, 4);
		expect(Array.from(indices)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 2, 2, 2, 2]);
	});
	test("without smoothing it is the plain argmax, first on a tie", () => {
		const logits = new Float32Array([1, 3, 3, 5, 0, 0]);
		expect(Array.from(chordminiIndices(logits, 2, 3, 108, 0))).toEqual([1, 0]);
	});
	test("a window boundary: frame 107 does not see frame 108", () => {
		// Frames 0..107 class 0 weakly; 108..115 class 1 strongly.
		const classes = 2;
		const frames = 116;
		const logits = new Float32Array(frames * classes);
		for (let f = 0; f < frames; f++) {
			if (f < 108) logits[f * classes] = 1;
			else logits[f * classes + 1] = 100;
		}
		const indices = chordminiIndices(logits, frames, classes, 108, 4);
		expect(indices[107]).toBe(0);
		expect(indices[108]).toBe(1);
		// Across one window, the strong frames would have won frame 107.
		const one = chordminiIndices(logits, frames, classes, 200, 4);
		expect(one[107]).toBe(1);
	});
});
