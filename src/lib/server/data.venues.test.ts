import { beforeEach, describe, expect, test } from "vite-plus/test";
import { MAX_ACCOUNT_VENUES } from "#lib/constants/venues.js";
import { callsTo, fake, reset } from "../../../tests/helpers/fakeDataLayer";

const {
	createEvent,
	createVenue,
	eventPage,
	linkVenue,
	listEvents,
	listVenues,
	searchVenues,
	unlinkVenue,
	updateEvent,
	updateVenue,
	updateVenueNotes,
	venueChoices,
	venuePage,
} = await import("./data");

/** Venues (docs/band-plan.md, "Event"): a shared directory, each account's list with its own notes and contact. */
const A = "acct-one____________";
const B = "acct-two____________";
const U = "user-one____________";
const U2 = "user-two____________";
const at = (iso: string) => new Date(iso);

const place = (id: string, name: string, city = "", over: Record<string, unknown> = {}) => ({
	id,
	name,
	address: "",
	city,
	mapUrl: "",
	websiteUrl: "",
	createdBy: U,
	updatedBy: U,
	createdAt: at("2026-10-01T00:00:00Z"),
	updatedAt: at("2026-10-01T00:00:00Z"),
	...over,
});
const link = (
	id: string,
	accountId: string,
	venueId: string,
	over: Record<string, unknown> = {},
) => ({
	id,
	accountId,
	venueId,
	notes: "",
	contact: "",
	createdAt: at("2026-10-01T00:00:00Z"),
	updatedAt: at("2026-10-01T00:00:00Z"),
	...over,
});
const ev = (id: string, accountId: string, over: Record<string, unknown> = {}) => ({
	id,
	accountId,
	kind: "show",
	title: "",
	status: "planned",
	startsOn: "2026-11-14",
	startsAt: "",
	endsAt: "",
	loadInAt: "",
	soundCheckAt: "",
	venueId: null,
	venue: "",
	address: "",
	city: "",
	mapUrl: "",
	venueNotes: "",
	notes: "",
	createdBy: U,
	createdAt: at("2026-10-01T00:00:00Z"),
	updatedAt: at("2026-10-01T00:00:00Z"),
	...over,
});

const fields = (name: string, city = "") => ({
	name,
	address: "",
	city,
	mapUrl: "",
	websiteUrl: "",
});

describe("listVenues, venueChoices", () => {
	beforeEach(() =>
		reset({
			venue: [
				place("v1", "the Hall", "Austin"),
				place("v2", "Annex", "Austin"),
				place("v3", "Zed's", "Dallas"),
			],
			accountVenue: [
				link("l1", A, "v1", { notes: "Back door", contact: "Sam 555-0100" }),
				link("l2", A, "v2"),
				link("l3", B, "v1", { notes: "B's own" }),
				link("l4", B, "v3"),
			],
			event: [
				ev("e1", A, { venueId: "v1" }),
				ev("e2", A, { venueId: "v1", kind: "practice" }),
				ev("e3", B, { venueId: "v1" }),
			],
		}),
	);
	test("the account's list by name, case-insensitively, with its own notes, contact and events", async () => {
		const rows = await listVenues(A);
		expect(rows.map((r) => [r.id, r.notes, r.contact, r.eventCount])).toEqual([
			["v2", "", "", 0],
			["v1", "Back door", "Sam 555-0100", 2],
		]);
		expect(rows[1]).toEqual({
			id: "v1",
			name: "the Hall",
			address: "",
			city: "Austin",
			mapUrl: "",
			websiteUrl: "",
			notes: "Back door",
			contact: "Sam 555-0100",
			eventCount: 2,
			createdAt: at("2026-10-01T00:00:00Z"),
			updatedAt: at("2026-10-01T00:00:00Z"),
		});
		expect((await listVenues(B)).map((r) => [r.id, r.notes, r.eventCount])).toEqual([
			["v1", "B's own", 1],
			["v3", "", 0],
		]);
	});
	test("choices: id, name and city of the account's list, by name", async () => {
		expect(await venueChoices(A)).toEqual([
			{ id: "v2", name: "Annex", city: "Austin" },
			{ id: "v1", name: "the Hall", city: "Austin" },
		]);
	});
});

describe("searchVenues", () => {
	beforeEach(() =>
		reset({
			venue: [
				place("v1", "The Hall", "Austin"),
				place("v2", "Annex", "Austin"),
				place("v3", "Mohawk", "Dallas"),
			],
		}),
	);
	test("the whole directory by name or city, case-insensitive, by name", async () => {
		expect((await searchVenues("hall")).map((v) => v.id)).toEqual(["v1"]);
		expect((await searchVenues("AUSTIN")).map((v) => v.id)).toEqual(["v2", "v1"]);
		expect(await searchVenues("mo")).toEqual([{ id: "v3", name: "Mohawk", city: "Dallas" }]);
	});
	test("nothing for an empty search or bare wildcards; the limit holds", async () => {
		expect(await searchVenues("  ")).toEqual([]);
		expect(await searchVenues("%")).toEqual([]);
		expect(await searchVenues("a", 1)).toHaveLength(1);
	});
});

describe("createVenue", () => {
	test("a new venue goes in the directory and on the account's list", async () => {
		reset({});
		const r = await createVenue(A, U, {
			...fields("The Hall", "Austin"),
			mapUrl: "https://m.example.com",
		});
		expect(r).toMatchObject({
			created: true,
			venue: {
				name: "The Hall",
				city: "Austin",
				mapUrl: "https://m.example.com",
				notes: "",
				eventCount: 0,
			},
		});
		expect(fake.rows("venue")).toMatchObject([{ name: "The Hall", createdBy: U, updatedBy: U }]);
		expect(fake.rows("accountVenue")).toMatchObject([
			{ accountId: A, venueId: fake.rows("venue")[0]!.id },
		]);
	});
	test("the same name and city (any case) links the existing venue instead, its facts untouched", async () => {
		reset({ venue: [place("v1", "The Hall", "Austin", { address: "1 Main St" })] });
		const r = await createVenue(B, U2, { ...fields("the hall", "AUSTIN"), address: "elsewhere" });
		expect(r).toMatchObject({ created: false, venue: { id: "v1", address: "1 Main St" } });
		expect(fake.rows("venue")).toHaveLength(1);
		expect(fake.rows("accountVenue")).toMatchObject([{ accountId: B, venueId: "v1" }]);
		// Already on the list: no second row.
		await createVenue(B, U2, fields("The Hall", "Austin"));
		expect(fake.rows("accountVenue")).toHaveLength(1);
	});
	test("the same name in another city is another venue", async () => {
		reset({ venue: [place("v1", "The Hall", "Austin")] });
		expect(await createVenue(A, U, fields("The Hall", "Dallas"))).toMatchObject({ created: true });
		expect(fake.rows("venue")).toHaveLength(2);
	});
	test('"full" at the account\'s cap, before anything is written', async () => {
		reset({
			venue: [place("vx", "Elsewhere")],
			accountVenue: Array.from({ length: MAX_ACCOUNT_VENUES }, (_, i) => link(`l${i}`, A, `v${i}`)),
		});
		expect(await createVenue(A, U, fields("The Hall"))).toBe("full");
		expect(await createVenue(A, U, fields("Elsewhere"))).toBe("full");
		expect(fake.rows("venue")).toHaveLength(1);
		expect(await createVenue(B, U, fields("The Hall"))).toMatchObject({ created: true });
	});
});

describe("updateVenue", () => {
	beforeEach(() =>
		reset({ venue: [place("v1", "The Hall", "Austin"), place("v2", "Annex", "Austin")] }),
	);
	test("anyone's correction of the shared facts, marked with who made it", async () => {
		expect(
			await updateVenue(U2, "v1", {
				...fields("The Hall", "Austin"),
				websiteUrl: "https://hall.example.com",
			}),
		).toBe(true);
		expect(fake.rows("venue")[0]).toMatchObject({
			websiteUrl: "https://hall.example.com",
			updatedBy: U2,
		});
	});
	test('"duplicate" when another venue has the name in that city; false for no such venue', async () => {
		expect(await updateVenue(U, "v2", fields("THE HALL", "austin"))).toBe("duplicate");
		expect(await updateVenue(U, "v2", fields("The Hall", "Dallas"))).toBe(true);
		expect(await updateVenue(U, "nope", fields("X"))).toBe(false);
		expect(callsTo("update", "venue")).toHaveLength(1);
	});
});

describe("linkVenue, unlinkVenue, updateVenueNotes", () => {
	beforeEach(() =>
		reset({
			venue: [place("v1", "The Hall"), place("v2", "Annex")],
			accountVenue: [link("l1", A, "v1")],
			event: [ev("e1", A, { venueId: "v1" }), ev("e2", B, { venueId: "v2" })],
		}),
	);
	test("link puts a venue on the list once; null for no such venue", async () => {
		expect(await linkVenue(A, "v2")).toMatchObject({ id: "v2", notes: "", eventCount: 0 });
		expect(await linkVenue(A, "v2")).toMatchObject({ id: "v2" });
		expect(fake.rows("accountVenue").filter((l) => l.accountId === A)).toHaveLength(2);
		expect(await linkVenue(A, "nope")).toBeNull();
	});
	test("unlink is refused while the account's events are there; another account's do not count", async () => {
		expect(await unlinkVenue(A, "v1")).toBe("used");
		reset({
			venue: [place("v2", "Annex")],
			accountVenue: [link("l2", A, "v2")],
			event: [ev("e2", B, { venueId: "v2" })],
		});
		expect(await unlinkVenue(A, "v2")).toBe(true);
		expect(fake.rows("accountVenue")).toEqual([]);
		expect(fake.rows("venue")).toHaveLength(1);
		expect(await unlinkVenue(A, "v2")).toBe(false);
	});
	test("notes and contact are the account's own, and put the venue on the list", async () => {
		expect(await updateVenueNotes(A, "v1", { notes: "Park out back", contact: "Sam" })).toBe(true);
		expect(await updateVenueNotes(B, "v1", { notes: "Load-in by the alley", contact: "" })).toBe(
			true,
		);
		expect(fake.rows("accountVenue").map((l) => [l.accountId, l.notes, l.contact])).toEqual([
			[A, "Park out back", "Sam"],
			[B, "Load-in by the alley", ""],
		]);
		expect(await updateVenueNotes(A, "nope", { notes: "", contact: "" })).toBe(false);
	});
});

describe("venuePage", () => {
	beforeEach(() =>
		reset({
			venue: [place("v1", "The Hall")],
			accountVenue: [link("l1", A, "v1", { notes: "Ours" })],
			event: [
				ev("e1", A, { venueId: "v1", startsOn: "2026-11-01" }),
				ev("e2", A, { venueId: "v1", startsOn: "2026-12-01", kind: "practice" }),
				ev("e3", A),
				ev("e4", B, { venueId: "v1" }),
			],
		}),
	);
	test("the venue with the account's notes and its shows and practices, newest day first", async () => {
		const page = await venuePage(A, "v1");
		expect(page?.venue).toMatchObject({ id: "v1", notes: "Ours", eventCount: 2 });
		expect(page?.events.map((e) => [e.id, e.venue])).toEqual([
			["e2", { id: "v1", name: "The Hall", city: "" }],
			["e1", { id: "v1", name: "The Hall", city: "" }],
		]);
	});
	test("null unless the venue is on the account's list", async () => {
		expect(await venuePage(B, "v1")).toBeNull();
		expect(await venuePage(A, "nope")).toBeNull();
	});
});

describe("events with venues", () => {
	beforeEach(() =>
		reset({
			venue: [place("v1", "The Hall", "Austin"), place("v2", "Annex")],
			accountVenue: [link("l1", A, "v1", { contact: "Sam" })],
			event: [
				ev("e1", A, { venueId: "v1", venue: "old text" }),
				ev("e2", A, { venue: "Legacy Bar", city: "Waco" }),
			],
		}),
	);
	test("listEvents carries the venue and the legacy text, and filters by venue", async () => {
		const rows = await listEvents(A, "show");
		expect(rows.map((r) => [r.id, r.venue, r.venueText, r.cityText])).toEqual([
			["e1", { id: "v1", name: "The Hall", city: "Austin" }, "old text", ""],
			["e2", null, "Legacy Bar", "Waco"],
		]);
		expect((await listEvents(A, "show", { venueId: "v1" })).map((r) => r.id)).toEqual(["e1"]);
	});
	test("eventPage carries the venue with the account's contact, and the account's choices", async () => {
		const page = await eventPage(A, "e1");
		expect(page?.venue).toMatchObject({ id: "v1", contact: "Sam", eventCount: 1 });
		expect(page?.venueChoices).toEqual([{ id: "v1", name: "The Hall", city: "Austin" }]);
		expect((await eventPage(A, "e2"))?.venue).toBeNull();
	});
	test("createEvent keeps a real venue (putting it on the list) and drops an unknown one", async () => {
		const input = { kind: "show" as const, title: "", startsOn: "2026-11-02" };
		expect(await createEvent(A, U, { ...input, venueId: "v2" })).toMatchObject({ venueId: "v2" });
		expect(fake.rows("accountVenue").map((l) => l.venueId)).toEqual(["v1", "v2"]);
		expect(await createEvent(A, U, { ...input, venueId: "nope" })).toMatchObject({ venueId: null });
		expect(await createEvent(A, U, { ...input, venueId: "" })).toMatchObject({
			venueId: null,
			venue: "",
		});
	});
	test("updateEvent sets, clears or keeps the venue; an unknown one leaves it", async () => {
		const base = {
			kind: "show" as const,
			title: "",
			status: "planned" as const,
			startsOn: "2026-11-14",
			startsAt: "",
			endsAt: "",
			loadInAt: "",
			soundCheckAt: "",
			notes: "",
		};
		expect(await updateEvent(A, "e1", { ...base, venueId: "nope" })).toMatchObject({
			venueId: "v1",
		});
		expect(await updateEvent(A, "e1", base)).toMatchObject({ venueId: "v1", venue: "old text" });
		expect(await updateEvent(A, "e1", { ...base, venueId: "v2" })).toMatchObject({ venueId: "v2" });
		expect(fake.rows("accountVenue").map((l) => l.venueId)).toEqual(["v1", "v2"]);
		expect(await updateEvent(A, "e1", { ...base, venueId: "" })).toMatchObject({ venueId: null });
		expect(await updateEvent(B, "e1", { ...base, venueId: "v2" })).toBeNull();
		expect(fake.rows("accountVenue").filter((l) => l.accountId === B)).toEqual([]);
	});
});
