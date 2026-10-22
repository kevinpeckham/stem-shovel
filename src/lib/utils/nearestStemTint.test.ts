import { describe, expect, it } from "vite-plus/test";
import { nearestStemTint } from "./nearestStemTint";

describe("nearestStemTint", () => {
	it("finds the tint a color is near, and none for a color far from every tint", () => {
		expect(nearestStemTint(0x7f, 0xb2, 0xc2)).toBe("sea");
		expect(nearestStemTint(0x70, 0xa8, 0xc8)).toBe("sea");
		expect(nearestStemTint(0xd3, 0x9a, 0x7e)).toBe("clay");
		expect(nearestStemTint(255, 0, 0)).toBeUndefined();
		expect(nearestStemTint(0, 0, 0)).toBeUndefined();
	});
});
