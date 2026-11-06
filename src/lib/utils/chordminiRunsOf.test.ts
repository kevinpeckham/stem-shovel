import { describe, expect, test } from "vite-plus/test";
import { chordminiRunsOf } from "./chordminiRunsOf";

describe("chordminiRunsOf", () => {
	const labels = ["C", "A:min", "N"];
	test("encodes runs with an exclusive end", () => {
		expect(chordminiRunsOf(new Int32Array([0, 0, 1, 1, 1, 2, 0]), labels)).toEqual([
			{ start: 0, end: 2, label: "C" },
			{ start: 2, end: 5, label: "A:min" },
			{ start: 5, end: 6, label: "N" },
			{ start: 6, end: 7, label: "C" },
		]);
	});
	test("one frame and none", () => {
		expect(chordminiRunsOf(new Int32Array([2]), labels)).toEqual([
			{ start: 0, end: 1, label: "N" },
		]);
		expect(chordminiRunsOf(new Int32Array([]), labels)).toEqual([]);
	});
});
