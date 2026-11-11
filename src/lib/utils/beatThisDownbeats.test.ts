import { describe, expect, test } from "vite-plus/test";
import { beatThisDownbeats } from "./beatThisDownbeats";

describe("beatThisDownbeats", () => {
	test("each downbeat moves to its nearest beat", () => {
		expect(beatThisDownbeats([0, 0.5, 1, 1.5, 2], [0.02, 1.48])).toEqual([0, 1.5]);
	});
	test("two downbeats on one beat collapse, and the result is sorted", () => {
		expect(beatThisDownbeats([0, 0.5, 1, 1.5, 2], [1.9, 1.02, 0.98])).toEqual([1, 2]);
	});
	test("a tie goes to the first beat", () => {
		expect(beatThisDownbeats([1, 2], [1.5])).toEqual([1]);
	});
	test("no beats: downbeats unchanged", () => {
		expect(beatThisDownbeats([], [0.3, 2.1])).toEqual([0.3, 2.1]);
	});
});
