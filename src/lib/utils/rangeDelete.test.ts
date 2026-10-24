import { describe, expect, it } from "vite-plus/test";
import { rangeDelete } from "./rangeDelete";

const c = (id: string, trackId: string, start: number, duration: number, offset = 0) => ({
	id,
	trackId,
	start,
	duration,
	offset,
	fadeIn: 0,
	fadeOut: 0,
});
const ids = () => {
	let n = 0;
	return () => `new${++n}`;
};
const spans = (list: ReturnType<typeof c>[]) =>
	list.map((k) => [k.id, k.trackId, k.start, k.duration, k.offset]);

describe("rangeDelete", () => {
	it("removes a clip wholly inside the range", () => {
		expect(spans(rangeDelete([c("a", "t", 2, 1)], 1, 4, false, ids()))).toEqual([]);
	});
	it("trims a clip straddling the start to end there", () => {
		expect(spans(rangeDelete([c("a", "t", 0, 3, 1)], 2, 5, false, ids()))).toEqual([
			["a", "t", 0, 2, 1],
		]);
	});
	it("keeps what comes after the end of a clip straddling it, its offset moved", () => {
		expect(spans(rangeDelete([c("a", "t", 2, 4, 0.5)], 1, 3, false, ids()))).toEqual([
			["a", "t", 3, 3, 1.5],
		]);
	});
	it("splits a clip spanning the range, the right piece under a new id", () => {
		const out = rangeDelete([{ ...c("a", "t", 0, 10, 1), notes: [{ t: 7 }] }], 2, 5, false, ids());
		expect(spans(out)).toEqual([
			["a", "t", 0, 2, 1],
			["new1", "t", 5, 5, 6],
		]);
		expect(out[1]?.notes).toEqual([{ t: 7 }]);
	});
	it("ripples every track: what is at or after the end moves earlier by the range", () => {
		const out = rangeDelete(
			[c("a", "t", 0, 10), c("b", "t", 12, 1), c("x", "u", 1, 1), c("y", "u", 6, 2)],
			2,
			5,
			true,
			ids(),
		);
		expect(spans(out)).toEqual([
			["a", "t", 0, 2, 0],
			["new1", "t", 2, 5, 5],
			["b", "t", 9, 1, 0],
			["x", "u", 1, 1, 0],
			["y", "u", 3, 2, 0],
		]);
	});
	it("without ripple, later clips stay put", () => {
		expect(spans(rangeDelete([c("b", "t", 12, 1)], 2, 5, false, ids()))).toEqual([
			["b", "t", 12, 1, 0],
		]);
	});
	it("drops a piece shorter than a millisecond", () => {
		expect(spans(rangeDelete([c("a", "t", 0, 2.0005)], 0.0005, 2, false, ids()))).toEqual([]);
	});
	it("cuts the fades at the cut edges and keeps the clip's own", () => {
		const out = rangeDelete([{ ...c("a", "t", 0, 10), fadeIn: 1, fadeOut: 1 }], 4, 6, false, ids());
		expect(out.map((k) => [k.fadeIn, k.fadeOut])).toEqual([
			[1, 0],
			[0, 1],
		]);
	});
	it("moves a looped clip's offset through its passes", () => {
		const looped = { ...c("a", "t", 0, 6, 0), loop: { start: 0, end: 2 } };
		expect(spans(rangeDelete([looped], 0, 3, false, ids()))).toEqual([["a", "t", 3, 3, 1]]);
	});
	it("returns the list as it is for an empty range", () => {
		const list = [c("a", "t", 0, 3)];
		expect(rangeDelete(list, 1, 1, true, ids())).toBe(list);
	});
});
