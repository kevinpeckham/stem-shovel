import { describe, expect, it } from "vite-plus/test";
import { keyWindows } from "./keyWindows";

describe("keyWindows", () => {
	it("every ten seconds, the last never shorter than five, one window for a short song", () => {
		expect(keyWindows(204.6)).toEqual([
			0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190,
		]);
		expect(keyWindows(14)).toEqual([0]);
		expect(keyWindows(16)).toEqual([0, 10]);
		expect(keyWindows(60, 30)).toEqual([0, 30]);
	});
});
