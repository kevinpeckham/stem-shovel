import { describe, expect, it } from "vite-plus/test";
import { shiftTimes } from "./shiftTimes";

const pts = (...ts: number[]) => ts.map((t) => ({ t, v: t * 10 }));

describe("shiftTimes", () => {
	it("drops items in the range and moves those at or after its end", () => {
		expect(shiftTimes(pts(1, 2, 3, 5, 6), "t", 2, 5, -3)).toEqual([
			{ t: 1, v: 10 },
			{ t: 2, v: 50 },
			{ t: 3, v: 60 },
		]);
	});
	it("keeps what is inside when the range is empty, and inserts later", () => {
		expect(shiftTimes(pts(1, 4), "t", 2, 2, 3).map((p) => p.t)).toEqual([1, 7]);
	});
	it("works on any time key and sorts the result", () => {
		const changes = [
			{ start: 8, bpm: 90 },
			{ start: 3, bpm: 120 },
		];
		expect(shiftTimes(changes, "start", 6, 6, -4)).toEqual([
			{ start: 3, bpm: 120 },
			{ start: 4, bpm: 90 },
		]);
	});
});
