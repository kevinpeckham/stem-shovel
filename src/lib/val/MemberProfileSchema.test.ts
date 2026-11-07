import * as v from "valibot";
import { describe, expect, test } from "vite-plus/test";
import { MemberProfileUpdateSchema } from "./MemberProfileSchema";

const ID = "V1StGXR8_Z5jdHi6B-myT";
const USER = "u1StGXR8_Z5jdHi6B-myT";
const ok = (schema: v.GenericSchema, input: unknown) => v.safeParse(schema, input).success;

describe("MemberProfileUpdateSchema", () => {
	const base = { accountId: ID, userId: USER };
	test("the account and the member; phone, instruments and notes default empty, trimmed", () => {
		expect(v.parse(MemberProfileUpdateSchema, base)).toEqual({
			...base,
			phone: "",
			instruments: "",
			notes: "",
		});
		expect(
			v.parse(MemberProfileUpdateSchema, {
				...base,
				phone: " 555-0100 ",
				instruments: " guitar, vocals ",
			}),
		).toMatchObject({ phone: "555-0100", instruments: "guitar, vocals" });
	});
	test("refuses a missing or malformed id", () => {
		expect(ok(MemberProfileUpdateSchema, { accountId: ID })).toBe(false);
		expect(ok(MemberProfileUpdateSchema, { ...base, userId: "not an id!" })).toBe(false);
	});
	test("bounds phone 60, instruments 200, notes 2,000", () => {
		for (const [field, max] of [
			["phone", 60],
			["instruments", 200],
			["notes", 2000],
		] as const) {
			expect(ok(MemberProfileUpdateSchema, { ...base, [field]: "x".repeat(max) })).toBe(true);
			expect(ok(MemberProfileUpdateSchema, { ...base, [field]: "x".repeat(max + 1) })).toBe(false);
		}
	});
});
