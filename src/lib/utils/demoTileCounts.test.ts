import { describe, expect, test } from "vite-plus/test";
import { demoTileCounts } from "./demoTileCounts";

describe("demoTileCounts", () => {
	const demos = [{ id: "d1" }, { id: "d2" }, { id: "d3" }];
	const comments = [{ demoId: "d1" }, { demoId: "d1" }, { demoId: "d2" }, { demoId: "gone" }];
	test("each demo's comments and new ones; a demo without either at zero", () => {
		expect(demoTileCounts(demos, comments, { d2: 1 }, null)).toEqual(
			new Map([
				["d1", { count: 2, fresh: 0 }],
				["d2", { count: 1, fresh: 1 }],
				["d3", { count: 0, fresh: 0 }],
			]),
		);
	});
	test("the open demo has no entry", () => {
		const counts = demoTileCounts(demos, comments, { d1: 3 }, "d1");
		expect(counts.has("d1")).toBe(false);
		expect(counts.get("d2")).toEqual({ count: 1, fresh: 0 });
	});
});
