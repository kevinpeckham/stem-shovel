import { describe, expect, test } from "vite-plus/test";
import { HOUR, MINUTE, rateLimited } from "./rateLimit";

describe("rateLimited", () => {
	test("allows up to the limit in the window, then refuses until it slides", () => {
		const t0 = 1_000_000;
		expect(rateLimited("k", 2, MINUTE, t0)).toBe(false);
		expect(rateLimited("k", 2, MINUTE, t0 + 10)).toBe(false);
		expect(rateLimited("k", 2, MINUTE, t0 + 20)).toBe(true);
		expect(rateLimited("k", 2, MINUTE, t0 + MINUTE + 1)).toBe(false);
	});
	test("keys are independent", () => {
		expect(rateLimited("a", 1, HOUR, 5)).toBe(false);
		expect(rateLimited("b", 1, HOUR, 5)).toBe(false);
		expect(rateLimited("a", 1, HOUR, 6)).toBe(true);
	});
});
