import { describe, expect, it } from "vite-plus/test";
import { rangeInsert } from "./rangeInsert";

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

describe("rangeInsert", () => {
	it("moves clips at or after the point later on every track; earlier ones stay", () => {
		const out = rangeInsert([c("a", "t", 0, 1), c("b", "t", 2, 1), c("x", "u", 4, 1)], 2, 3, ids());
		expect(spans(out)).toEqual([
			["a", "t", 0, 1, 0],
			["b", "t", 5, 1, 0],
			["x", "u", 7, 1, 0],
		]);
	});
	it("splits a clip across the point, its right piece moved later under a new id", () => {
		const out = rangeInsert([c("a", "t", 1, 4, 0.5)], 3, 2, ids());
		expect(spans(out)).toEqual([
			["a", "t", 1, 2, 0.5],
			["new1", "t", 5, 2, 2.5],
		]);
	});
	it("does not split within a millisecond of an edge", () => {
		const out = rangeInsert([c("a", "t", 1, 2), c("b", "u", 0, 3)], 1.0005, 1, ids());
		expect(spans(out)).toEqual([
			["a", "t", 2, 2, 0],
			["b", "u", 0, 1.0005, 0],
			["new1", "u", 2.0005, 1.9995, 1.0005],
		]);
		expect(spans(rangeInsert([c("a", "t", 0, 2)], 1.9995, 1, ids()))).toEqual([
			["a", "t", 0, 2, 0],
		]);
	});
	it("returns the list as it is for nothing inserted", () => {
		const list = [c("a", "t", 0, 3)];
		expect(rangeInsert(list, 1, 0, ids())).toBe(list);
	});
});
