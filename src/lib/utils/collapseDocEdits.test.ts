import { describe, expect, test } from "vite-plus/test";
import { collapseDocEdits } from "./collapseDocEdits";

const MIN = 60_000;
const GAP = 30 * MIN;
const at = (minutes: number) => new Date(Date.UTC(2026, 10, 13, 12, 0) + minutes * MIN);
const edit = (
	minutes: number,
	over: Partial<{ songId: string; kind: string; createdBy: string | null }> = {},
) => ({
	id: `r${minutes}`,
	songId: "s1",
	kind: "chart",
	createdBy: "u1" as string | null,
	createdAt: at(minutes),
	...over,
});
const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe("collapseDocEdits", () => {
	test("ten saves of one chart in five minutes are one edit, the newest", () => {
		const saves = Array.from({ length: 10 }, (_, i) => edit(5 - i * 0.5));
		expect(ids(collapseDocEdits(saves, GAP))).toEqual(["r5"]);
	});

	test("the gap runs from save to save: a long sitting is one edit, a return after a break another", () => {
		// 12:00 to 13:00 with a save every 20 minutes, then nothing until 14:00.
		const saves = [edit(120), edit(60), edit(40), edit(20), edit(0)];
		expect(ids(collapseDocEdits(saves, GAP))).toEqual(["r120", "r60"]);
	});

	test("exactly the gap apart still joins; a moment more does not", () => {
		expect(ids(collapseDocEdits([edit(30), edit(0)], GAP))).toEqual(["r30"]);
		expect(ids(collapseDocEdits([edit(30.1), edit(0)], GAP))).toEqual(["r30.1", "r0"]);
	});

	test("another person, another document or another song is its own edit", () => {
		const saves = [
			edit(4),
			edit(3, { createdBy: "u2" }),
			edit(2, { kind: "lyrics" }),
			edit(1, { songId: "s2" }),
			edit(0),
		];
		expect(ids(collapseDocEdits(saves, GAP))).toEqual(["r4", "r3", "r2", "r1"]);
	});

	test("the order is kept, and nothing given is nothing", () => {
		const saves = [edit(9, { songId: "s2" }), edit(8), edit(7, { songId: "s2" }), edit(6)];
		expect(ids(collapseDocEdits(saves, GAP))).toEqual(["r9", "r8"]);
		expect(collapseDocEdits([], GAP)).toEqual([]);
	});
});
