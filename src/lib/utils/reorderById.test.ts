import { describe, expect, test } from "vite-plus/test";
import { reorderById } from "./reorderById";

const items = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];

describe("reorderById", () => {
	test("puts the items in the listed order", () => {
		expect(reorderById(items, ["c", "a", "d", "b"]).map((i) => i.id)).toEqual(["c", "a", "d", "b"]);
	});
	test("ignores ids it does not have and keeps unnamed items after the named ones, in their old order", () => {
		expect(reorderById(items, ["d", "zz", "b"]).map((i) => i.id)).toEqual(["d", "b", "a", "c"]);
	});
	test("an empty list changes nothing", () => {
		expect(reorderById(items, []).map((i) => i.id)).toEqual(["a", "b", "c", "d"]);
	});
});
