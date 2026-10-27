import { describe, expect, test } from "vite-plus/test";
import { TableSort } from "./tableSort.svelte";

const rows = [
	{ title: "b", count: 1 },
	{ title: "a", count: 3 },
	{ title: "c", count: 2 },
];

describe("TableSort", () => {
	test("starts on its column, descending when the column is in descFirst", () => {
		const sort = new TableSort<"title" | "count">("count", ["count"]);
		expect(sort.dirOf("count")).toBe("desc");
		expect(sort.dirOf("title")).toBeNull();
		expect(sort.apply(rows).map((r) => r.count)).toEqual([3, 2, 1]);
	});

	test("starts ascending on a column outside descFirst", () => {
		const sort = new TableSort<"title" | "count">("title");
		expect(sort.apply(rows).map((r) => r.title)).toEqual(["a", "b", "c"]);
	});

	test("a click flips the sorted column and starts another in its own direction", () => {
		const sort = new TableSort<"title" | "count">("count", ["count"]);
		sort.sortBy("count");
		expect(sort.dirOf("count")).toBe("asc");
		sort.sortBy("title");
		expect(sort.dirOf("title")).toBe("asc");
		expect(sort.dirOf("count")).toBeNull();
		sort.sortBy("count");
		expect(sort.dirOf("count")).toBe("desc");
	});
});
