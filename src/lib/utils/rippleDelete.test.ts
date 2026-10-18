import { describe, expect, it } from "vite-plus/test";
import { rippleDelete } from "./rippleDelete";

const c = (id: string, trackId: string, start: number, duration: number) => ({
	id,
	trackId,
	start,
	duration,
});

describe("rippleDelete", () => {
	it("closes the gap behind a removed clip on its track alone", () => {
		const out = rippleDelete(
			[c("a", "t", 0, 2), c("b", "t", 2, 2), c("c", "t", 5, 1), c("x", "u", 4, 1)],
			["b"],
		);
		expect(out.map((k) => [k.id, k.start])).toEqual([
			["a", 0],
			["c", 3],
			["x", 4],
		]);
	});
	it("merges touching removed clips into one span and shifts by the whole of it", () => {
		const out = rippleDelete([c("a", "t", 0, 1), c("b", "t", 1, 1), c("c", "t", 3, 1)], ["a", "b"]);
		expect(out.map((k) => [k.id, k.start])).toEqual([["c", 1]]);
	});
	it("a clip beside but before the removed one stays; an unknown id removes nothing", () => {
		const list = [c("a", "t", 0, 1), c("b", "t", 4, 1)];
		expect(rippleDelete(list, ["b"]).map((k) => k.start)).toEqual([0]);
		expect(rippleDelete(list, ["zzz"])).toBe(list);
	});
});
