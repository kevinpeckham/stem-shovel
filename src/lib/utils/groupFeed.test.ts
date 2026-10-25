import { describe, expect, test } from "vite-plus/test";
import { groupFeed } from "./groupFeed";

/** The project feed's layout (docs/chat.md, "The project page"): a date line where the day changes, then each message on its own. */
const day = (d: number, h = 10) => new Date(2026, 9, d, h).getTime();

describe("groupFeed", () => {
	test("a date line opens each day; every message is its own line", () => {
		const lines = groupFeed([
			{ id: "a", createdAt: day(9) },
			{ id: "b", createdAt: day(9, 11) },
			{ id: "c", createdAt: day(10) },
		]);
		expect(lines.map((l) => (l.kind === "date" ? `date@${l.at}` : l.id))).toEqual([
			`date@${day(9)}`,
			"a",
			"b",
			`date@${day(10)}`,
			"c",
		]);
	});
	test("nothing in, nothing out", () => {
		expect(groupFeed([])).toEqual([]);
	});
});
