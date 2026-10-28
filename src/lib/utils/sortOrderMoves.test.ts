import { describe, expect, test } from "vite-plus/test";
import { sortOrderMoves } from "./sortOrderMoves";

const rows = [
	{ id: "a", sortOrder: 0 },
	{ id: "b", sortOrder: 1 },
	{ id: "c", sortOrder: 2 },
];

describe("sortOrderMoves", () => {
	test("returns only the rows whose position changed, with their new sort order", () => {
		expect(sortOrderMoves(rows, ["a", "c", "b"])).toEqual([
			{ id: "c", sortOrder: 1 },
			{ id: "b", sortOrder: 2 },
		]);
	});
	test("the same order moves nothing", () => {
		expect(sortOrderMoves(rows, ["a", "b", "c"])).toEqual([]);
	});
	test("renumbers rows whose stored order has gaps", () => {
		expect(
			sortOrderMoves(
				[
					{ id: "a", sortOrder: 0 },
					{ id: "b", sortOrder: 5 },
				],
				["a", "b"],
			),
		).toEqual([{ id: "b", sortOrder: 1 }]);
	});
	test("null when an id is missing, repeated, unknown or extra", () => {
		expect(sortOrderMoves(rows, ["a", "b"])).toBeNull();
		expect(sortOrderMoves(rows, ["a", "b", "b"])).toBeNull();
		expect(sortOrderMoves(rows, ["a", "b", "z"])).toBeNull();
		expect(sortOrderMoves(rows, ["a", "b", "c", "d"])).toBeNull();
	});
	test("an empty list matches no rows", () => {
		expect(sortOrderMoves([], [])).toEqual([]);
	});
});
