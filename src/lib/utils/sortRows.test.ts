import { describe, expect, it } from "vite-plus/test";
import { sortRows } from "./sortRows";

const rows = [
	{ id: "a", title: "banana", when: new Date("2026-10-02"), n: 3, place: "" },
	{ id: "b", title: "Apple", when: new Date("2026-10-03"), n: 10, place: "Room" },
	{ id: "c", title: "cherry", when: new Date("2026-10-01"), n: 3, place: "attic" },
	{ id: "d", title: "apple", when: new Date("2026-10-02"), n: 1, place: "" },
];
const ids = (list: { id: string }[]) => list.map((r) => r.id);

describe("sortRows", () => {
	it("sorts strings case-insensitively, ties in their original order", () => {
		expect(ids(sortRows(rows, "title", "asc"))).toEqual(["b", "d", "a", "c"]);
		expect(ids(sortRows(rows, "title", "desc"))).toEqual(["c", "a", "b", "d"]);
	});

	it("sorts Dates by time", () => {
		expect(ids(sortRows(rows, "when", "desc"))).toEqual(["b", "a", "d", "c"]);
		expect(ids(sortRows(rows, "when", "asc"))).toEqual(["c", "a", "d", "b"]);
	});

	it("sorts numbers by size, not as text", () => {
		expect(ids(sortRows(rows, "n", "asc"))).toEqual(["d", "a", "c", "b"]);
		expect(ids(sortRows(rows, "n", "desc"))).toEqual(["b", "a", "c", "d"]);
	});

	it("puts blank and missing values last in either direction", () => {
		expect(ids(sortRows(rows, "place", "asc"))).toEqual(["c", "b", "a", "d"]);
		expect(ids(sortRows(rows, "place", "desc"))).toEqual(["b", "c", "a", "d"]);
		const withNull = [
			{ id: "x", v: null },
			{ id: "y", v: "z" },
		];
		expect(ids(sortRows(withNull, "v", "asc"))).toEqual(["y", "x"]);
	});

	it("returns a copy and leaves the input alone", () => {
		const before = ids(rows);
		const sorted = sortRows(rows, "title", "asc");
		expect(sorted).not.toBe(rows);
		expect(ids(rows)).toEqual(before);
	});
});
