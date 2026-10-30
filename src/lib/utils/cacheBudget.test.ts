import { describe, expect, it } from "vite-plus/test";
import { cacheBudget } from "./cacheBudget";

describe("cacheBudget", () => {
	it("is the limit when half the quota is more", () => {
		expect(cacheBudget(1000, 10_000)).toBe(1000);
	});
	it("is half the quota when that is less", () => {
		expect(cacheBudget(1000, 600)).toBe(300);
	});
	it("is the limit when the quota is unknown", () => {
		expect(cacheBudget(1000, 0)).toBe(1000);
	});
});
