import * as v from "valibot";
import { describe, expect, test } from "vite-plus/test";
import {
	EventCreateSchema,
	EventSetReorderSchema,
	EventUpdateSchema,
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

describe("EventCreateSchema", () => {
	const base = { accountId: ID, kind: "show", startsOn: "2026-11-14" };
	test("the kind and the day; title, venue, venueId and locationId default empty", () => {
		expect(v.parse(EventCreateSchema, base)).toEqual({
			...base,
			title: "",
			venue: "",
			venueId: "",
			locationId: "",
		});
	});
	test("locationId is an id or empty", () => {
		expect(ok(EventCreateSchema, { ...base, kind: "practice", locationId: ID })).toBe(true);
		expect(ok(EventCreateSchema, { ...base, locationId: "The garage!" })).toBe(false);
	});
	test("venueId is an id or empty", () => {
		expect(ok(EventCreateSchema, { ...base, venueId: ID })).toBe(true);
		expect(ok(EventCreateSchema, { ...base, venueId: "The Hall!" })).toBe(false);
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
	test("every text defaults to empty; the venue and the legacy place fields stay out when not sent", () => {
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
			notes: "",
		});
	});
	test("venueId: an id, or empty for none", () => {
		const base = { id: ID, kind: "show", status: "planned", startsOn: "2026-11-14" };
		expect(v.parse(EventUpdateSchema, { ...base, venueId: "" }).venueId).toBe("");
		expect(v.parse(EventUpdateSchema, { ...base, venueId: ID }).venueId).toBe(ID);
		expect(ok(EventUpdateSchema, { ...base, venueId: "not an id!" })).toBe(false);
	});
	test("locationId: an id, empty for none, or left out to keep it", () => {
		const base = { id: ID, kind: "practice", status: "planned", startsOn: "2026-11-14" };
		expect(v.parse(EventUpdateSchema, { ...base, locationId: "" }).locationId).toBe("");
		expect(v.parse(EventUpdateSchema, { ...base, locationId: ID }).locationId).toBe(ID);
		expect("locationId" in v.parse(EventUpdateSchema, base)).toBe(false);
		expect(ok(EventUpdateSchema, { ...base, locationId: "not an id!" })).toBe(false);
	});
	test("the legacy place fields keep their bounds when sent", () => {
		const base = { id: ID, kind: "show", status: "planned", startsOn: "2026-11-14" };
		expect(v.parse(EventUpdateSchema, { ...base, venue: " The Hall " }).venue).toBe("The Hall");
		expect(ok(EventUpdateSchema, { ...base, mapUrl: "http://x.com" })).toBe(false);
		expect(ok(EventUpdateSchema, { ...base, venueNotes: "x".repeat(2001) })).toBe(false);
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
