import { describe, expect, it } from "vite-plus/test";
import { pageOf } from "./pageOf";

const list = Array.from({ length: 25 }, (_, i) => i);

describe("pageOf", () => {
	it("shows the first page and says more remain", () => {
		const p = pageOf(list, 10);
		expect(p.visible).toEqual(list.slice(0, 10));
		expect(p).toMatchObject({ count: 10, total: 25, more: true });
	});

	it("stops at the end of the list", () => {
		expect(pageOf(list, 30)).toMatchObject({ count: 25, total: 25, more: false });
	});

	it("handles a short or empty list", () => {
		expect(pageOf([1, 2], 10)).toMatchObject({ visible: [1, 2], count: 2, total: 2, more: false });
		expect(pageOf([], 10)).toMatchObject({ visible: [], count: 0, total: 0, more: false });
	});
});
