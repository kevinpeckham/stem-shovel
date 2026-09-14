import { describe, expect, test } from "vite-plus/test";
import { normalizeInviteCode } from "./normalizeInviteCode";

describe("normalizeInviteCode", () => {
	test("strips separators and spaces, upper-cases", () => {
		expect(normalizeInviteCode(" abcd-efgh jklm ")).toBe("ABCDEFGHJKLM");
	});
	test("leaves a clean code alone", () => {
		expect(normalizeInviteCode("ABCDEFGHJKLM")).toBe("ABCDEFGHJKLM");
	});
	test("empty in, empty out", () => {
		expect(normalizeInviteCode("")).toBe("");
	});
});
