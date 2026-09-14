import { describe, expect, test } from "vite-plus/test";
import { formatInviteCode } from "./formatInviteCode";

describe("formatInviteCode", () => {
	test("groups in fours", () => {
		expect(formatInviteCode("ABCDEFGHJKLM")).toBe("ABCD-EFGH-JKLM");
	});
	test("a short tail keeps its length", () => {
		expect(formatInviteCode("ABCDEF")).toBe("ABCD-EF");
	});
	test("empty stays empty", () => {
		expect(formatInviteCode("")).toBe("");
	});
});
