import { describe, expect, test } from "vite-plus/test";
import { SongPointerMenus } from "./songPointerMenus.svelte.js";

/** Where the song page's two pointer menus were opened. */
describe("SongPointerMenus", () => {
	test("both start closed; each opens where the pointer was", () => {
		const menus = new SongPointerMenus();
		expect(menus.demoAt).toBeNull();
		expect(menus.mixAt).toBeNull();
		const demo = { id: "d1", label: "Kitchen take" };
		menus.openDemo(demo, 12.5, 10, 20);
		expect(menus.demoAt).toEqual({ demo, seconds: 12.5, x: 10, y: 20 });
		menus.openMix(30, 40, 50);
		expect(menus.mixAt).toEqual({ seconds: 30, x: 40, y: 50 });
		menus.demoAt = null;
		expect(menus.demoAt).toBeNull();
	});
});
