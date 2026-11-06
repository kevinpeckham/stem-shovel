import { describe, expect, it } from "vite-plus/test";
import { pageSlice } from "./pageSlice";

const list = (n: number) => Array.from({ length: n }, (_, i) => i);

describe("pageSlice", () => {
	it("makes an empty list one empty page", () => {
		expect(pageSlice([], 1, 10)).toEqual({ items: [], page: 1, pages: 1 });
	});

	it("cuts an exact multiple into full pages", () => {
		const r = pageSlice(list(20), 2, 10);
		expect(r.pages).toBe(2);
		expect(r.page).toBe(2);
		expect(r.items).toEqual(list(20).slice(10));
	});

	it("leaves the remainder on a last partial page", () => {
		const r = pageSlice(list(25), 3, 10);
		expect(r).toEqual({ items: [20, 21, 22, 23, 24], page: 3, pages: 3 });
	});

	it("clamps a page below 1 to the first", () => {
		expect(pageSlice(list(25), 0, 10)).toEqual({ items: list(10), page: 1, pages: 3 });
		expect(pageSlice(list(25), -4, 10).page).toBe(1);
	});

	it("clamps a page past the end to the last", () => {
		expect(pageSlice(list(25), 9, 10)).toEqual({ items: [20, 21, 22, 23, 24], page: 3, pages: 3 });
	});
});
