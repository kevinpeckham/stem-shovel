import { describe, expect, test } from "vite-plus/test";
import { collapseDiffContext } from "./collapseDiffContext";
import { diffLines } from "./diffLines";

const lines = (n: number, from = 0) => Array.from({ length: n }, (_, i) => `l${i + from}`);

describe("collapseDiffContext", () => {
	test("keeps two lines of context around a change and folds the rest", () => {
		const before = lines(10).join("\n");
		const after = [...lines(5), "new", ...lines(5, 5)].join("\n");
		expect(collapseDiffContext(diffLines(before, after))).toEqual([
			{ kind: "skip", count: 3 },
			{ kind: "same", text: "l3" },
			{ kind: "same", text: "l4" },
			{ kind: "added", text: "new" },
			{ kind: "same", text: "l5" },
			{ kind: "same", text: "l6" },
			{ kind: "skip", count: 3 },
		]);
	});
	test("a single unchanged line between kept ones is shown, not folded", () => {
		const d = diffLines("x\na\nb\nc\nd\ne\ny", "X\na\nb\nc\nd\ne\nY");
		expect(collapseDiffContext(d).some((r) => r.kind === "skip")).toBe(false);
	});
	test("no change folds to one row, an empty diff to none", () => {
		expect(collapseDiffContext(diffLines("a\nb\nc", "a\nb\nc"))).toEqual([
			{ kind: "skip", count: 3 },
		]);
		expect(collapseDiffContext([])).toEqual([]);
	});
});
