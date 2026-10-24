import { describe, expect, test } from "vite-plus/test";
import { diffLines } from "./diffLines";

describe("diffLines", () => {
	test("identical texts are all the same", () => {
		expect(diffLines("a\nb\nc", "a\nb\nc")).toEqual([
			{ kind: "same", text: "a" },
			{ kind: "same", text: "b" },
			{ kind: "same", text: "c" },
		]);
	});
	test("an inserted line is added", () => {
		expect(diffLines("a\nc", "a\nb\nc")).toEqual([
			{ kind: "same", text: "a" },
			{ kind: "added", text: "b" },
			{ kind: "same", text: "c" },
		]);
	});
	test("a removed line is removed", () => {
		expect(diffLines("a\nb\nc", "a\nc")).toEqual([
			{ kind: "same", text: "a" },
			{ kind: "removed", text: "b" },
			{ kind: "same", text: "c" },
		]);
	});
	test("a changed line is the old one removed and the new one added", () => {
		expect(diffLines("a\nb\nc", "a\nB\nc")).toEqual([
			{ kind: "same", text: "a" },
			{ kind: "removed", text: "b" },
			{ kind: "added", text: "B" },
			{ kind: "same", text: "c" },
		]);
	});
	test("an empty side is all added or all removed", () => {
		expect(diffLines("", "a\nb")).toEqual([
			{ kind: "added", text: "a" },
			{ kind: "added", text: "b" },
		]);
		expect(diffLines("a", "")).toEqual([{ kind: "removed", text: "a" }]);
		expect(diffLines("", "")).toEqual([]);
	});
	test("a trailing newline and CRLF do not count as a change", () => {
		expect(diffLines("a\nb\n", "a\r\nb")).toEqual([
			{ kind: "same", text: "a" },
			{ kind: "same", text: "b" },
		]);
	});
	test("past 2000 lines a side everything is removed then added", () => {
		const big = Array.from({ length: 2001 }, (_, i) => `l${i}`).join("\n");
		const d = diffLines(big, "x");
		expect(d).toHaveLength(2002);
		expect(d[0]).toEqual({ kind: "removed", text: "l0" });
		expect(d.at(-1)).toEqual({ kind: "added", text: "x" });
	});
});
