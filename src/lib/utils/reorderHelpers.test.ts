import { describe, expect, test } from "vite-plus/test";
import { dropIndexAt } from "./dropIndexAt";
import { moveId } from "./moveId";
import { reorderWithinGroup } from "./reorderWithinGroup";

describe("dropIndexAt", () => {
	const boxes = [
		{ top: 0, height: 40 },
		{ top: 40, height: 40 },
		{ top: 80, height: 40 },
	];
	test("the first row whose middle the pointer is above; the last when below them all", () => {
		expect(dropIndexAt(boxes, 10)).toBe(0);
		expect(dropIndexAt(boxes, 25)).toBe(1);
		expect(dropIndexAt(boxes, 65)).toBe(2);
		expect(dropIndexAt(boxes, 500)).toBe(2);
		expect(dropIndexAt([], 5)).toBe(0);
	});
});

describe("moveId", () => {
	test("moves an id to an index, clamped", () => {
		expect(moveId(["a", "b", "c"], "c", 0)).toEqual(["c", "a", "b"]);
		expect(moveId(["a", "b", "c"], "a", 9)).toEqual(["b", "c", "a"]);
		expect(moveId(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
		expect(moveId(["a", "b", "c"], "zz", 0)).toEqual(["a", "b", "c"]);
	});
});

describe("reorderWithinGroup", () => {
	test("refills the group's slots in the new order and leaves everything else in place", () => {
		// Finished: f1 f2; in progress: p1 p2 p3, interleaved in the list.
		const all = ["p1", "f1", "p2", "p3", "f2"];
		expect(reorderWithinGroup(all, ["p3", "p1", "p2"])).toEqual(["p3", "f1", "p1", "p2", "f2"]);
		expect(reorderWithinGroup(all, ["f2", "f1"])).toEqual(["p1", "f2", "p2", "p3", "f1"]);
		expect(reorderWithinGroup(all, [])).toEqual(all);
	});
});
