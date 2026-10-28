import * as v from "valibot";
import { describe, expect, test } from "vite-plus/test";
import {
	EventCreateSchema,
	EventSetReorderSchema,
	EventUpdateSchema,
	MapUrlSchema,
	TimeSchema,
} from "./EventSchema";

const ID = "V1StGXR8_Z5jdHi6B-myT";
const ok = (schema: v.GenericSchema, input: unknown) => v.safeParse(schema, input).success;

describe("TimeSchema", () => {
	test("a 24-hour HH:MM, or nothing", () => {
		for (const t of ["00:00", "07:05", "19:30", "23:59", "", "  "])
			expect(ok(TimeSchema, t)).toBe(true);
		expect(v.parse(TimeSchema, undefined)).toBe("");
		expect(v.parse(TimeSchema, " 19:30 ")).toBe("19:30");
	});
	test("refuses other shapes with the message", () => {
		for (const t of ["24:00", "7:30", "19:60", "19:30:00", "7pm", "1930"])
			expect(ok(TimeSchema, t)).toBe(false);
		const r = v.safeParse(TimeSchema, "7pm");
		expect(r.issues?.some((i) => i.message === "Use a time like 19:30.")).toBe(true);
	});
});

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

describe("EventCreateSchema", () => {
	const base = { accountId: ID, kind: "show", startsOn: "2026-11-14" };
	test("the kind and the day; title and venue default empty", () => {
		expect(v.parse(EventCreateSchema, base)).toEqual({ ...base, title: "", venue: "" });
	});
	test("refuses a day that is not YYYY-MM-DD and an unknown kind", () => {
		expect(ok(EventCreateSchema, { ...base, startsOn: "11/14/2026" })).toBe(false);
		expect(ok(EventCreateSchema, { ...base, startsOn: "" })).toBe(false);
		expect(ok(EventCreateSchema, { ...base, kind: "gig" })).toBe(false);
	});
	test("bounds the title", () => {
		expect(ok(EventCreateSchema, { ...base, title: "x".repeat(160) })).toBe(true);
		expect(ok(EventCreateSchema, { ...base, title: "x".repeat(161) })).toBe(false);
	});
});

describe("EventUpdateSchema", () => {
	test("every text defaults to empty", () => {
		expect(
			v.parse(EventUpdateSchema, {
				id: ID,
				kind: "practice",
				status: "planned",
				startsOn: "2026-11-14",
			}),
		).toEqual({
			id: ID,
			kind: "practice",
			status: "planned",
			startsOn: "2026-11-14",
			title: "",
			startsAt: "",
			endsAt: "",
			loadInAt: "",
			soundCheckAt: "",
			venue: "",
			address: "",
			city: "",
			mapUrl: "",
			venueNotes: "",
			notes: "",
		});
	});
	test("refuses an unknown status and a bad time", () => {
		const base = { id: ID, kind: "show", status: "played", startsOn: "2026-11-14" };
		expect(ok(EventUpdateSchema, { ...base, status: "postponed" })).toBe(false);
		expect(ok(EventUpdateSchema, { ...base, loadInAt: "5:00" })).toBe(false);
	});
});

describe("EventSetReorderSchema", () => {
	test("at least one id, at most 50", () => {
		expect(ok(EventSetReorderSchema, { eventId: ID, ids: [] })).toBe(false);
		expect(ok(EventSetReorderSchema, { eventId: ID, ids: [ID] })).toBe(true);
		expect(ok(EventSetReorderSchema, { eventId: ID, ids: Array(51).fill(ID) })).toBe(false);
	});
});
