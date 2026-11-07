import * as v from "valibot";
import { describe, expect, test } from "vite-plus/test";
import {
	ContactCreateSchema,
	ContactEmailSchema,
	ContactIdSchema,
	ContactNameSchema,
	ContactRefSchema,
	ContactUpdateSchema,
} from "./ContactSchema";

const ID = "V1StGXR8_Z5jdHi6B-myT";
const ok = (schema: v.GenericSchema, input: unknown) => v.safeParse(schema, input).success;
const issue = (schema: v.GenericSchema, input: unknown) =>
	v.safeParse(schema, input).issues?.[0]?.message;

describe("ContactNameSchema", () => {
	test("trimmed, required, at most 160 characters", () => {
		expect(v.parse(ContactNameSchema, "  Dana Reyes ")).toBe("Dana Reyes");
		expect(issue(ContactNameSchema, "   ")).toBe("Give the contact a name.");
		expect(ok(ContactNameSchema, "x".repeat(160))).toBe(true);
		expect(issue(ContactNameSchema, "x".repeat(161))).toBe("Keep the name under 160 characters.");
	});
});

describe("ContactEmailSchema", () => {
	test("an address or nothing, trimmed", () => {
		expect(v.parse(ContactEmailSchema, " dana@example.com ")).toBe("dana@example.com");
		expect(v.parse(ContactEmailSchema, "  ")).toBe("");
	});
	test("refuses what is not an address, and one past 200 characters", () => {
		expect(issue(ContactEmailSchema, "dana at example")).toBe("Enter an email address.");
		expect(ok(ContactEmailSchema, `${"x".repeat(190)}@example.com`)).toBe(false);
	});
});

describe("ContactCreateSchema", () => {
	test("a name is required; the rest default empty", () => {
		expect(v.parse(ContactCreateSchema, { accountId: ID, name: " Sam " })).toEqual({
			accountId: ID,
			name: "Sam",
			role: "",
			phone: "",
			email: "",
			address: "",
			notes: "",
		});
		expect(ok(ContactCreateSchema, { accountId: ID })).toBe(false);
		expect(ok(ContactCreateSchema, { accountId: "nope!", name: "Sam" })).toBe(false);
	});
	test("bounds role 80, phone 60, address 300, notes 2,000", () => {
		const base = { accountId: ID, name: "Sam" };
		for (const [field, max] of [
			["role", 80],
			["phone", 60],
			["address", 300],
			["notes", 2000],
		] as const) {
			expect(ok(ContactCreateSchema, { ...base, [field]: "x".repeat(max) })).toBe(true);
			expect(ok(ContactCreateSchema, { ...base, [field]: "x".repeat(max + 1) })).toBe(false);
		}
		expect(issue(ContactCreateSchema, { ...base, notes: "x".repeat(2001) })).toBe(
			"Keep the notes under 2,000 characters.",
		);
	});
});

describe("ContactUpdateSchema, ContactIdSchema, ContactRefSchema", () => {
	test("an id and the fields, trimmed", () => {
		expect(
			v.parse(ContactUpdateSchema, {
				id: ID,
				name: "Dana ",
				role: " Promoter",
				phone: " 555-0100 ",
				email: "dana@example.com",
				address: "",
				notes: " Pays on the night ",
			}),
		).toEqual({
			id: ID,
			name: "Dana",
			role: "Promoter",
			phone: "555-0100",
			email: "dana@example.com",
			address: "",
			notes: "Pays on the night",
		});
		expect(ok(ContactUpdateSchema, { id: ID, name: "" })).toBe(false);
		expect(ok(ContactIdSchema, { id: ID })).toBe(true);
		expect(ok(ContactIdSchema, { id: "" })).toBe(false);
	});
	test("a reference is an id or empty", () => {
		expect(ok(ContactRefSchema, "")).toBe(true);
		expect(ok(ContactRefSchema, ID)).toBe(true);
		expect(ok(ContactRefSchema, "Dana!")).toBe(false);
	});
});
