import { describe, expect, it } from "vite-plus/test";
import { median } from "./median";

describe("median", () => {
	it("takes the middle value, or the mean of the middle two", () => {
		expect(median([3, 1, 2])).toBe(2);
		expect(median([4, 1, 3, 2])).toBe(2.5);
	});
	it("is NaN for no values", () => {
		expect(median([])).toBeNaN();
	});
});
