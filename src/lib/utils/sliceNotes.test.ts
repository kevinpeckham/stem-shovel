import { describe, expect, it } from "vite-plus/test";
import { sliceNotes } from "./sliceNotes";

const n = (t: number, d: number, p = 60) => ({ t, d, p, v: 0.8 });

describe("sliceNotes", () => {
	it("keeps the notes starting inside the window, re-timed from its start, cut at its end", () => {
		expect(sliceNotes([n(0.5, 1), n(2, 1), n(3.5, 2), n(4, 0.5)], 2, 4)).toEqual([
			n(0, 1),
			n(1.5, 0.5),
		]);
	});
	it("leaves a note that began before the window to the earlier piece", () => {
		expect(sliceNotes([n(1, 3)], 2, 4)).toEqual([]);
	});
	it("drops a note cut to nothing at the window's end", () => {
		expect(sliceNotes([n(3.9995, 1)], 2, 4)).toEqual([]);
	});
	it("rounds to a tenth of a millisecond", () => {
		expect(sliceNotes([n(2.123456, 0.333333)], 2, 4)).toEqual([n(0.1235, 0.3333)]);
	});
});
