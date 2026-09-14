import { describe, expect, test } from "vite-plus/test";
import * as v from "valibot";
import { InviteCodeCreateSchema, InviteCodeSchema } from "./InviteCodeSchema";

describe("InviteCodeSchema", () => {
	test("normalises what was typed", () => {
		expect(v.parse(InviteCodeSchema, "abcd-efgh jk2m")).toBe("ABCDEFGHJK2M");
	});
	test("rejects the wrong length", () => {
		expect(v.safeParse(InviteCodeSchema, "ABC").success).toBe(false);
	});
});

describe("InviteCodeCreateSchema", () => {
	const accountId = "V1StGXR8_Z5jdHi6B-myT";
	test("defaults: member, unlimited, never expires", () => {
		expect(v.parse(InviteCodeCreateSchema, { accountId })).toEqual({
			accountId,
			role: "member",
			note: "",
			maxUses: null,
			expiresDays: 0,
		});
	});
	test("reads the numbers a form sends", () => {
		const out = v.parse(InviteCodeCreateSchema, {
			accountId,
			role: "viewer",
			maxUses: "5",
			expiresDays: "30",
			note: " band ",
		});
		expect(out).toMatchObject({ role: "viewer", maxUses: 5, expiresDays: 30, note: "band" });
	});
	test("refuses zero uses, an owner role and an odd duration", () => {
		expect(v.safeParse(InviteCodeCreateSchema, { accountId, maxUses: "0" }).success).toBe(false);
		expect(v.safeParse(InviteCodeCreateSchema, { accountId, role: "owner" }).success).toBe(false);
		expect(v.safeParse(InviteCodeCreateSchema, { accountId, expiresDays: "3" }).success).toBe(
			false,
		);
	});
});
