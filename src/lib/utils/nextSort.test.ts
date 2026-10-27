import { describe, expect, it } from "vite-plus/test";
import { nextSort } from "./nextSort";

describe("nextSort", () => {
	it("flips the direction on the same column", () => {
		expect(nextSort({ key: "title", dir: "asc" }, "title")).toEqual({ key: "title", dir: "desc" });
		expect(nextSort({ key: "title", dir: "desc" }, "title")).toEqual({ key: "title", dir: "asc" });
	});

	it("starts another column ascending, or descending when it is listed so", () => {
		expect(nextSort({ key: "when", dir: "desc" }, "title")).toEqual({ key: "title", dir: "asc" });
		expect(nextSort({ key: "title", dir: "asc" }, "when", ["when"])).toEqual({
			key: "when",
			dir: "desc",
		});
	});
});
