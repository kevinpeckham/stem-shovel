import * as v from "valibot";
import { describe, expect, test } from "vite-plus/test";
import {
	MapUrlSchema,
	VenueCreateSchema,
	VenueLinkSchema,
	VenueLocalSchema,
	VenueSearchSchema,
	VenueUpdateSchema,
	VenueWebsiteUrlSchema,
} from "./VenueSchema";

const ID = "V1StGXR8_Z5jdHi6B-myT";
const ok = (schema: v.GenericSchema, input: unknown) => v.safeParse(schema, input).success;

describe("MapUrlSchema", () => {
	test("an https address or nothing", () => {
		expect(v.parse(MapUrlSchema, "https://maps.app.goo.gl/abc")).toBe(
			"https://maps.app.goo.gl/abc",
		);
		expect(v.parse(MapUrlSchema, "")).toBe("");
		expect(v.parse(MapUrlSchema, undefined)).toBe("");
	});
	test("refuses http, other schemes, words and overlong links", () => {
		for (const u of [
			"http://maps.example.com",
			"javascript:alert(1)",
			"the bar on 5th",
			`https://x.com/${"a".repeat(500)}`,
		])
			expect(ok(MapUrlSchema, u)).toBe(false);
	});
});

describe("VenueWebsiteUrlSchema", () => {
	test("an https address or nothing", () => {
		expect(v.parse(VenueWebsiteUrlSchema, " https://thehall.example.com ")).toBe(
			"https://thehall.example.com",
		);
		expect(v.parse(VenueWebsiteUrlSchema, "")).toBe("");
	});
	test("refuses http, words and overlong links", () => {
		for (const u of ["http://thehall.example.com", "the hall", `https://x.com/${"a".repeat(500)}`])
			expect(ok(VenueWebsiteUrlSchema, u)).toBe(false);
	});
});

describe("VenueCreateSchema", () => {
	test("a name is required; the rest default empty", () => {
		expect(v.parse(VenueCreateSchema, { accountId: ID, name: " The Hall " })).toEqual({
			accountId: ID,
			name: "The Hall",
			address: "",
			city: "",
			mapUrl: "",
			websiteUrl: "",
		});
		const r = v.safeParse(VenueCreateSchema, { accountId: ID, name: "  " });
		expect(r.issues?.some((i) => i.message === "Give the venue a name.")).toBe(true);
	});
	test("bounds the name, address and city", () => {
		const base = { accountId: ID, name: "The Hall" };
		expect(ok(VenueCreateSchema, { ...base, name: "x".repeat(160) })).toBe(true);
		expect(ok(VenueCreateSchema, { ...base, name: "x".repeat(161) })).toBe(false);
		expect(ok(VenueCreateSchema, { ...base, address: "x".repeat(301) })).toBe(false);
		expect(ok(VenueCreateSchema, { ...base, city: "x".repeat(121) })).toBe(false);
	});
});

describe("VenueUpdateSchema", () => {
	test("the shared facts by id", () => {
		expect(
			v.parse(VenueUpdateSchema, {
				id: ID,
				name: "The Hall",
				address: "1 Main St",
				city: "Austin",
				mapUrl: "https://maps.example.com/x",
				websiteUrl: "https://thehall.example.com",
			}),
		).toMatchObject({ id: ID, city: "Austin" });
		expect(ok(VenueUpdateSchema, { id: "not an id!", name: "The Hall" })).toBe(false);
	});
});

describe("VenueLocalSchema", () => {
	test("the account's notes (2,000) and contact (500), empty by default", () => {
		const base = { accountId: ID, venueId: ID };
		expect(v.parse(VenueLocalSchema, base)).toEqual({ ...base, notes: "", contact: "" });
		expect(ok(VenueLocalSchema, { ...base, notes: "x".repeat(2000) })).toBe(true);
		expect(ok(VenueLocalSchema, { ...base, notes: "x".repeat(2001) })).toBe(false);
		expect(ok(VenueLocalSchema, { ...base, contact: "x".repeat(501) })).toBe(false);
	});
});

describe("VenueLinkSchema, VenueSearchSchema", () => {
	test("a link names an account and a venue", () => {
		expect(ok(VenueLinkSchema, { accountId: ID, venueId: ID })).toBe(true);
		expect(ok(VenueLinkSchema, { accountId: ID })).toBe(false);
	});
	test("a search is trimmed and bounded", () => {
		expect(v.parse(VenueSearchSchema, { q: "  hall " })).toEqual({ q: "hall" });
		expect(v.parse(VenueSearchSchema, {})).toEqual({ q: "" });
		expect(ok(VenueSearchSchema, { q: "x".repeat(161) })).toBe(false);
	});
});
