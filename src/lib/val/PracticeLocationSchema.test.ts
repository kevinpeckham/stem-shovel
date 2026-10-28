import * as v from "valibot";
import { describe, expect, test } from "vite-plus/test";
import {
	PracticeLocationCreateSchema,
	PracticeLocationIdSchema,
	PracticeLocationNameSchema,
	PracticeLocationUpdateSchema,
} from "./PracticeLocationSchema";

const ID = "V1StGXR8_Z5jdHi6B-myT";
const ok = (schema: v.GenericSchema, input: unknown) => v.safeParse(schema, input).success;
const issue = (schema: v.GenericSchema, input: unknown) =>
	v.safeParse(schema, input).issues?.[0]?.message;

describe("PracticeLocationNameSchema", () => {
	test("trimmed, required, at most 160 characters", () => {
		expect(v.parse(PracticeLocationNameSchema, "  The garage ")).toBe("The garage");
		expect(issue(PracticeLocationNameSchema, "   ")).toBe("Give the location a name.");
		expect(ok(PracticeLocationNameSchema, "x".repeat(160))).toBe(true);
		expect(ok(PracticeLocationNameSchema, "x".repeat(161))).toBe(false);
	});
});

describe("PracticeLocationCreateSchema", () => {
	test("a name is required; address and notes default empty", () => {
		expect(v.parse(PracticeLocationCreateSchema, { accountId: ID, name: " The garage " })).toEqual({
			accountId: ID,
			name: "The garage",
			address: "",
			notes: "",
		});
		expect(ok(PracticeLocationCreateSchema, { accountId: ID })).toBe(false);
		expect(ok(PracticeLocationCreateSchema, { accountId: "nope!", name: "x" })).toBe(false);
	});
	test("bounds the address at 300 and the notes at 2,000", () => {
		const base = { accountId: ID, name: "Studio B" };
		expect(ok(PracticeLocationCreateSchema, { ...base, address: "x".repeat(300) })).toBe(true);
		expect(ok(PracticeLocationCreateSchema, { ...base, address: "x".repeat(301) })).toBe(false);
		expect(ok(PracticeLocationCreateSchema, { ...base, notes: "x".repeat(2000) })).toBe(true);
		expect(ok(PracticeLocationCreateSchema, { ...base, notes: "x".repeat(2001) })).toBe(false);
	});
});

describe("PracticeLocationUpdateSchema, PracticeLocationIdSchema", () => {
	test("an id and the fields, trimmed", () => {
		expect(
			v.parse(PracticeLocationUpdateSchema, {
				id: ID,
				name: "Studio B ",
				address: " 12 Elm St",
				notes: " Code 4411 ",
			}),
		).toEqual({ id: ID, name: "Studio B", address: "12 Elm St", notes: "Code 4411" });
		expect(ok(PracticeLocationUpdateSchema, { id: ID, name: "" })).toBe(false);
		expect(ok(PracticeLocationIdSchema, { id: ID })).toBe(true);
		expect(ok(PracticeLocationIdSchema, { id: "" })).toBe(false);
	});
});
