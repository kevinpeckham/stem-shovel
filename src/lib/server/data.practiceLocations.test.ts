import { beforeEach, describe, expect, test } from "vite-plus/test";
import { MAX_PRACTICE_LOCATIONS_PER_ACCOUNT } from "#lib/constants/practiceLocations.js";
import { callsTo, fake, reset } from "../../../tests/helpers/fakeDataLayer";

const {
	createEvent,
	createPracticeLocation,
	deletePracticeLocation,
	eventPage,
	findPracticeLocation,
	listEvents,
	listPracticeLocations,
	practiceLocationChoices,
	updateEvent,
	updatePracticeLocation,
} = await import("./data");

/** Practice locations (docs/band-plan.md, "Event"): the account's own places to practice, saved and reused. */
const A = "acct-one____________";
const B = "acct-two____________";
const U = "user-one____________";
const at = (iso: string) => new Date(iso);

const loc = (id: string, accountId: string, name: string, over: Record<string, unknown> = {}) => ({
	id,
	accountId,
	name,
	address: "",
	notes: "",
	createdBy: U,
	createdAt: at("2026-10-01T00:00:00Z"),
	updatedAt: at("2026-10-01T00:00:00Z"),
	...over,
});
const place = (id: string, name: string) => ({
	id,
	name,
	address: "",
	city: "",
	mapUrl: "",
	websiteUrl: "",
	createdBy: U,
	updatedBy: U,
	createdAt: at("2026-10-01T00:00:00Z"),
	updatedAt: at("2026-10-01T00:00:00Z"),
});
const ev = (id: string, accountId: string, over: Record<string, unknown> = {}) => ({
	id,
	accountId,
	kind: "practice",
	title: "",
	status: "planned",
	startsOn: "2026-11-14",
	startsAt: "",
	endsAt: "",
	loadInAt: "",
	soundCheckAt: "",
	venueId: null,
	locationId: null,
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
const fields = (name: string, over: Partial<{ address: string; notes: string }> = {}) => ({
	name,
	address: "",
	notes: "",
	...over,
});

describe("listPracticeLocations, practiceLocationChoices, findPracticeLocation", () => {
	beforeEach(() =>
		reset({
			practiceLocation: [
				loc("p1", A, "the garage", { address: "12 Elm St", notes: "Code 4411" }),
				loc("p2", A, "Annex"),
				loc("p3", B, "B's room"),
			],
			event: [
				ev("e1", A, { locationId: "p1" }),
				ev("e2", A, { locationId: "p1" }),
				ev("e3", A, { locationId: "p2" }),
				// Another account's event pointing here (it should not) does not count.
				ev("e4", B, { locationId: "p1" }),
			],
		}),
	);
	test("the account's locations by name, case-insensitively, with its events there", async () => {
		const rows = await listPracticeLocations(A);
		expect(rows.map((r) => [r.id, r.eventCount])).toEqual([
			["p2", 1],
			["p1", 2],
		]);
		expect(rows[1]).toEqual({
			id: "p1",
			name: "the garage",
			address: "12 Elm St",
			notes: "Code 4411",
			eventCount: 2,
			createdAt: at("2026-10-01T00:00:00Z"),
			updatedAt: at("2026-10-01T00:00:00Z"),
		});
		expect((await listPracticeLocations(B)).map((r) => r.id)).toEqual(["p3"]);
	});
	test("choices: id and name, by name", async () => {
		expect(await practiceLocationChoices(A)).toEqual([
			{ id: "p2", name: "Annex" },
			{ id: "p1", name: "the garage" },
		]);
	});
	test("find: the account's own, else null", async () => {
		expect(await findPracticeLocation(A, "p1")).toMatchObject({ id: "p1", eventCount: 2 });
		expect(await findPracticeLocation(B, "p1")).toBeNull();
		expect(await findPracticeLocation(A, "nope")).toBeNull();
	});
});

describe("createPracticeLocation", () => {
	test("a new location in the account, marked with who made it", async () => {
		reset({});
		const r = await createPracticeLocation(A, U, fields("The garage", { address: "12 Elm St" }));
		expect(r).toMatchObject({ name: "The garage", address: "12 Elm St", eventCount: 0 });
		expect(fake.rows("practiceLocation")).toMatchObject([
			{ accountId: A, name: "The garage", createdBy: U },
		]);
	});
	test('"duplicate" for a name the account has (any case); another account may use it', async () => {
		reset({ practiceLocation: [loc("p1", A, "The Garage")] });
		expect(await createPracticeLocation(A, U, fields("the garage"))).toBe("duplicate");
		expect(await createPracticeLocation(B, U, fields("The Garage"))).toMatchObject({
			name: "The Garage",
		});
		expect(fake.rows("practiceLocation")).toHaveLength(2);
	});
	test('"full" at the cap, before anything is written', async () => {
		reset({
			practiceLocation: Array.from({ length: MAX_PRACTICE_LOCATIONS_PER_ACCOUNT }, (_, i) =>
				loc(`p${i}`, A, `Room ${i}`),
			),
		});
		expect(await createPracticeLocation(A, U, fields("One more"))).toBe("full");
		expect(fake.rows("practiceLocation")).toHaveLength(MAX_PRACTICE_LOCATIONS_PER_ACCOUNT);
		expect(await createPracticeLocation(B, U, fields("One more"))).toMatchObject({
			name: "One more",
		});
	});
});

describe("updatePracticeLocation", () => {
	beforeEach(() =>
		reset({
			practiceLocation: [loc("p1", A, "The garage"), loc("p2", A, "Annex"), loc("p3", B, "Mine")],
		}),
	);
	test("name, address and notes; the row back", async () => {
		expect(
			await updatePracticeLocation(A, "p1", fields("The Garage", { notes: "Code 4411" })),
		).toMatchObject({ id: "p1", name: "The Garage", notes: "Code 4411" });
		expect(fake.rows("practiceLocation")[0]).toMatchObject({ notes: "Code 4411" });
	});
	test("\"duplicate\" when another of the account's has the name; null when not the account's", async () => {
		expect(await updatePracticeLocation(A, "p2", fields("THE GARAGE"))).toBe("duplicate");
		expect(await updatePracticeLocation(A, "p2", fields("Mine"))).toMatchObject({ name: "Mine" });
		expect(await updatePracticeLocation(B, "p1", fields("X"))).toBeNull();
		expect(await updatePracticeLocation(A, "nope", fields("X"))).toBeNull();
		expect(callsTo("update", "practice_location")).toHaveLength(1);
	});
});

describe("deletePracticeLocation", () => {
	beforeEach(() =>
		reset({
			practiceLocation: [loc("p1", A, "The garage"), loc("p2", A, "Annex")],
			event: [ev("e1", A, { locationId: "p1" })],
		}),
	);
	test('"used" while the account\'s practices are there', async () => {
		expect(await deletePracticeLocation(A, "p1")).toBe("used");
		expect(fake.rows("practiceLocation")).toHaveLength(2);
	});
	test("gone when unused; false when not the account's", async () => {
		expect(await deletePracticeLocation(B, "p2")).toBe(false);
		expect(await deletePracticeLocation(A, "p2")).toBe(true);
		expect(fake.rows("practiceLocation").map((r) => r.id)).toEqual(["p1"]);
		expect(await deletePracticeLocation(A, "p2")).toBe(false);
	});
});

describe("events with practice locations", () => {
	beforeEach(() =>
		reset({
			venue: [place("v1", "The Hall")],
			accountVenue: [],
			practiceLocation: [loc("p1", A, "The garage"), loc("p2", A, "Annex"), loc("p3", B, "Theirs")],
			event: [ev("e1", A, { locationId: "p1" }), ev("e2", A), ev("s1", A, { kind: "show" })],
		}),
	);
	test("listEvents carries the location and filters by it", async () => {
		const rows = await listEvents(A, "practice");
		expect(rows.map((r) => [r.id, r.location])).toEqual([
			["e1", { id: "p1", name: "The garage" }],
			["e2", null],
		]);
		expect((await listEvents(A, "practice", { locationId: "p1" })).map((r) => r.id)).toEqual([
			"e1",
		]);
		expect((await listEvents(A, "show"))[0]?.location).toBeNull();
	});
	test("eventPage carries the location and the account's choices", async () => {
		const page = await eventPage(A, "e1");
		expect(page?.location).toMatchObject({ id: "p1", name: "The garage", eventCount: 1 });
		expect(page?.locationChoices).toEqual([
			{ id: "p2", name: "Annex" },
			{ id: "p1", name: "The garage" },
		]);
		expect((await eventPage(A, "e2"))?.location).toBeNull();
	});
	test("createEvent keeps the account's location, drops another account's or an unknown one", async () => {
		const input = { kind: "practice" as const, title: "", startsOn: "2026-11-02" };
		expect(await createEvent(A, U, { ...input, locationId: "p2" })).toMatchObject({
			locationId: "p2",
		});
		expect(await createEvent(A, U, { ...input, locationId: "p3" })).toMatchObject({
			locationId: null,
		});
		expect(await createEvent(A, U, { ...input, locationId: "nope" })).toMatchObject({
			locationId: null,
		});
		expect(await createEvent(A, U, { ...input, locationId: "" })).toMatchObject({
			locationId: null,
		});
	});
	test("a practice never gets a venue, a show never a location", async () => {
		expect(
			await createEvent(A, U, {
				kind: "practice",
				title: "",
				startsOn: "2026-11-02",
				venueId: "v1",
				locationId: "p1",
			}),
		).toMatchObject({ venueId: null, locationId: "p1" });
		expect(
			await createEvent(A, U, {
				kind: "show",
				title: "",
				startsOn: "2026-11-02",
				venueId: "v1",
				locationId: "p1",
			}),
		).toMatchObject({ venueId: "v1", locationId: null });
	});
	const base = {
		title: "",
		status: "planned" as const,
		startsOn: "2026-11-14",
		startsAt: "",
		endsAt: "",
		loadInAt: "",
		soundCheckAt: "",
		notes: "",
	};
	test("updateEvent sets, clears or keeps the location; an unknown or another account's leaves it", async () => {
		const practice = { ...base, kind: "practice" as const };
		expect(await updateEvent(A, "e1", practice)).toMatchObject({ locationId: "p1" });
		expect(await updateEvent(A, "e1", { ...practice, locationId: "p3" })).toMatchObject({
			locationId: "p1",
		});
		expect(await updateEvent(A, "e1", { ...practice, locationId: "nope" })).toMatchObject({
			locationId: "p1",
		});
		expect(await updateEvent(A, "e1", { ...practice, locationId: "p2" })).toMatchObject({
			locationId: "p2",
		});
		expect(await updateEvent(A, "e1", { ...practice, locationId: "" })).toMatchObject({
			locationId: null,
		});
		expect(await updateEvent(B, "e1", { ...practice, locationId: "p3" })).toBeNull();
	});
	test("updateEvent clears a practice's venue and a show's location, whatever was sent", async () => {
		expect(await updateEvent(A, "e1", { ...base, kind: "practice", venueId: "v1" })).toMatchObject({
			venueId: null,
			locationId: "p1",
		});
		expect(
			await updateEvent(A, "e1", { ...base, kind: "show", venueId: "v1", locationId: "p2" }),
		).toMatchObject({ venueId: "v1", locationId: null });
	});
});
