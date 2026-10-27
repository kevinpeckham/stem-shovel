import { describe, expect, it } from "vite-plus/test";
import { filterByTitle } from "./filterByTitle";

const items = [
	{ id: "a", title: "Morning Riff" },
	{ id: "b", title: "" },
	{ id: "c", title: "riff two" },
	{ id: "d", title: "Bridge" },
];
const ids = (list: { id: string }[]) => list.map((i) => i.id);

describe("filterByTitle", () => {
	it("keeps everything for an empty or blank query", () => {
		expect(filterByTitle(items, "")).toBe(items);
		expect(ids(filterByTitle(items, "   "))).toEqual(["a", "b", "c", "d"]);
	});

	it("matches case-insensitively and trims the query", () => {
		expect(ids(filterByTitle(items, "  RIFF "))).toEqual(["a", "c"]);
	});

	it("matches an empty title as Untitled", () => {
		expect(ids(filterByTitle(items, "untit"))).toEqual(["b"]);
	});

	it("returns nothing when nothing matches", () => {
		expect(filterByTitle(items, "chorus")).toEqual([]);
	});
});
