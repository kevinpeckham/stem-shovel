import { describe, expect, test } from "vite-plus/test";
import { accountLimits, storageFits } from "./accountLimits";

const GB = 1024 ** 3;

describe("accountLimits", () => {
	test("a free account gets the plan's limits", () => {
		expect(accountLimits({ plan: "free", isFounder: false, storageLimitBytes: null })).toEqual({
			storageBytes: 10 * GB,
			members: 5,
		});
	});
	test("an admin override replaces the plan's storage limit only", () => {
		expect(accountLimits({ plan: "free", isFounder: false, storageLimitBytes: 30 * GB })).toEqual({
			storageBytes: 30 * GB,
			members: 5,
		});
	});
	test("a founder account has no limits, override or not", () => {
		expect(accountLimits({ plan: "free", isFounder: true, storageLimitBytes: 1 })).toEqual({
			storageBytes: null,
			members: null,
		});
	});
});

describe("storageFits", () => {
	test("counts the incoming file against what is held", () => {
		expect(storageFits(9 * GB, GB, 10 * GB)).toBe(true);
		expect(storageFits(9 * GB, GB + 1, 10 * GB)).toBe(false);
		expect(storageFits(100 * GB, GB, null)).toBe(true);
	});
});
