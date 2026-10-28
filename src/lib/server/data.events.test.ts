import { beforeEach, describe, expect, test } from "vite-plus/test";
import { MAX_EVENT_SETS, MAX_EVENTS_PER_ACCOUNT } from "#lib/val/EventSchema.js";
import { callsTo, cascade, fake, reset } from "../../../tests/helpers/fakeDataLayer";

const {
	addEventSet,
	createEvent,
	deleteEvent,
	eventPage,
	linkEventSession,
	listEvents,
	removeEventSet,
	reorderEventSets,
	updateEvent,
	updateEventSetLabel,
} = await import("./data");

const A = "acct-one____________";
const B = "acct-two____________";
const U = "user-one____________";
const at = (iso: string) => new Date(iso);

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
const list = (id: string, accountId: string, over: Record<string, unknown> = {}) => ({
	id,
	accountId,
	title: `List ${id}`,
	notes: "",
	createdAt: at("2026-10-01T00:00:00Z"),
	...over,
});
const set = (
	id: string,
	eventId: string,
	setListId: string,
	over: Record<string, unknown> = {},
) => ({
	id,
	eventId,
	setListId,
	sortOrder: 0,
	label: "",
	createdAt: at("2026-10-01T00:00:00Z"),
	...over,
});
const session = (id: string, accountId: string, over: Record<string, unknown> = {}) => ({
	id,
	accountId,
	kind: "show",
	name: "",
	place: "",
	startsOn: "2026-10-01",
	eventId: null,
	createdAt: at("2026-10-01T00:00:00Z"),
	...over,
});

describe("listEvents", () => {
	test("the account's events of one kind, by day then creation, with set and session counts", async () => {
		reset({
			event: [
				ev("e1", A, { startsOn: "2026-12-01", venue: "The Hall", city: "Austin" }),
				ev("e2", A, { startsOn: "2026-11-01", createdAt: at("2026-10-05T00:00:00Z") }),
				ev("e3", A, { startsOn: "2026-11-01", createdAt: at("2026-10-02T00:00:00Z") }),
				ev("e4", A, { kind: "practice" }),
				ev("e5", B),
			],
			eventSet: [set("s1", "e1", "l1"), set("s2", "e1", "l1", { sortOrder: 1 })],
			recordingSession: [session("r1", A, { eventId: "e1" })],
		});
		const rows = await listEvents(A, "show");
		expect(rows.map((r) => [r.id, r.setCount, r.sessionCount])).toEqual([
			["e3", 0, 0],
			["e2", 0, 0],
			["e1", 2, 1],
		]);
		expect(rows[2]).toEqual({
			id: "e1",
			kind: "show",
			title: "",
			status: "planned",
			startsOn: "2026-12-01",
			startsAt: "",
			venue: null,
			location: null,
			venueText: "The Hall",
			cityText: "Austin",
			setCount: 2,
			sessionCount: 1,
			posterThumbnailUrl: null,
			posterUrl: null,
			createdAt: at("2026-10-01T00:00:00Z"),
			updatedAt: at("2026-10-01T00:00:00Z"),
		});
		expect((await listEvents(A, "practice")).map((r) => r.id)).toEqual(["e4"]);
	});
});

describe("eventPage", () => {
	beforeEach(() =>
		reset({
			event: [ev("e1", A, { title: "With The Night Shift" }), ev("e2", B)],
			setList: [
				list("l1", A, { title: "Zed" }),
				list("l2", A, { title: "Acoustic" }),
				list("l9", B),
			],
			setListItem: [
				{ id: "i1", setListId: "l1", title: "", note: "", sortOrder: 0 },
				{ id: "i2", setListId: "l1", title: "", note: "", sortOrder: 1 },
			],
			eventSet: [
				set("s1", "e1", "l1", { sortOrder: 1, label: "Encore" }),
				set("s2", "e1", "l2", { sortOrder: 0, label: "Set 1" }),
				set("s3", "e1", "l9", { sortOrder: 2 }),
			],
			recordingSession: [
				session("r1", A, { eventId: "e1", startsOn: "2026-11-15", name: "Late" }),
				session("r2", A, { eventId: "e1", startsOn: "2026-11-14", place: "The Hall" }),
				session("r3", A, { startsOn: "2026-12-01" }),
				session("r9", B, { eventId: "e1" }),
			],
			sessionRecording: [
				{ id: "x1", accountId: A, sessionId: "r1", status: "ready" },
				{ id: "x2", accountId: A, sessionId: "r1", status: "uploading" },
			],
		}),
	);
	test("another account's event is not found", async () => {
		expect(await eventPage(A, "e2")).toBeNull();
		expect(await eventPage(B, "e1")).toBeNull();
	});
	test("the event, its sets in order, its sessions by day, and the choices", async () => {
		const page = await eventPage(A, "e1");
		expect(page?.event).toMatchObject({ id: "e1", title: "With The Night Shift", accountId: A });
		// Another account's set list never shows, even if a row points at it.
		expect(page?.sets).toEqual([
			{ id: "s2", setListId: "l2", label: "Set 1", sortOrder: 0, title: "Acoustic", itemCount: 0 },
			{ id: "s1", setListId: "l1", label: "Encore", sortOrder: 1, title: "Zed", itemCount: 2 },
		]);
		expect(page?.sessions).toEqual([
			{
				id: "r2",
				name: "",
				kind: "show",
				place: "The Hall",
				startsOn: "2026-11-14",
				recordingCount: 0,
			},
			{
				id: "r1",
				name: "Late",
				kind: "show",
				place: "",
				startsOn: "2026-11-15",
				recordingCount: 1,
			},
		]);
		expect(page?.setListChoices).toEqual([
			{ id: "l2", title: "Acoustic", itemCount: 0 },
			{ id: "l1", title: "Zed", itemCount: 2 },
		]);
		expect(page?.sessionChoices.map((s) => [s.id, s.eventId])).toEqual([
			["r3", null],
			["r1", "e1"],
			["r2", "e1"],
		]);
	});
});

describe("createEvent, updateEvent, deleteEvent", () => {
	test("create makes the event with its kind, day, title and venue", async () => {
		reset({});
		const row = await createEvent(A, U, {
			kind: "practice",
			title: "",
			startsOn: "2026-11-02",
			venue: "Rehearsal room",
		});
		expect(row).toMatchObject({
			accountId: A,
			kind: "practice",
			status: "planned",
			startsOn: "2026-11-02",
			venue: "Rehearsal room",
			startsAt: "",
			createdBy: U,
		});
		expect(fake.rows("event")).toHaveLength(1);
	});
	test("null at the account's cap; another account's events do not count", async () => {
		reset({ event: Array.from({ length: MAX_EVENTS_PER_ACCOUNT }, (_, i) => ev(`e${i}`, A)) });
		const input = { kind: "show" as const, title: "", startsOn: "2026-11-02", venue: "" };
		expect(await createEvent(A, U, input)).toBeNull();
		expect(await createEvent(B, U, input)).toMatchObject({ accountId: B });
	});
	test("update is scoped to the account and writes every field", async () => {
		reset({ event: [ev("e1", A)] });
		const fields = {
			kind: "show" as const,
			title: "Release show",
			status: "confirmed" as const,
			startsOn: "2026-11-20",
			startsAt: "21:00",
			endsAt: "23:30",
			loadInAt: "18:00",
			soundCheckAt: "19:00",
			venue: "The Hall",
			address: "1 Main St",
			city: "Austin",
			mapUrl: "https://maps.example.com/x",
			venueNotes: "Back door",
			notes: "Bring merch",
		};
		expect(await updateEvent(B, "e1", fields)).toBeNull();
		expect(await updateEvent(A, "e1", fields)).toMatchObject({ id: "e1", ...fields });
		// Another account's event is not written at all.
		expect(callsTo("update", "event")).toHaveLength(1);
		expect(callsTo("update", "event")[0]?.values).toMatchObject({ updatedAt: expect.any(Date) });
		// No `venueId` given: the venue is left as it is.
		expect(callsTo("update", "event")[0]?.values).not.toHaveProperty("venueId");
	});
	test("delete hands the event to the cascade, only for its own account", async () => {
		reset({ event: [ev("e1", A)] });
		expect(await deleteEvent(B, "e1")).toBe(false);
		expect(cascade.deleteEventRows).not.toHaveBeenCalled();
		expect(await deleteEvent(A, "e1")).toBe(true);
		expect(cascade.deleteEventRows).toHaveBeenCalledWith(["e1"]);
	});
});

describe("addEventSet", () => {
	beforeEach(() =>
		reset({
			event: [ev("e1", A), ev("e2", B)],
			setList: [list("l1", A, { title: "Main" }), list("l9", B)],
			setListItem: [{ id: "i1", setListId: "l1", title: "", note: "", sortOrder: 0 }],
			eventSet: [set("s1", "e1", "l1", { sortOrder: 3 })],
		}),
	);
	test("the set list goes last, the same one twice is fine, and the event is touched", async () => {
		expect(await addEventSet(A, "e1", "l1")).toEqual({
			id: expect.any(String),
			setListId: "l1",
			label: "",
			sortOrder: 4,
			title: "Main",
			itemCount: 1,
		});
		expect(fake.rows("eventSet")).toHaveLength(2);
		expect(callsTo("update", "event")).toHaveLength(1);
	});
	test("null for another account's event or set list", async () => {
		expect(await addEventSet(A, "e2", "l1")).toBeNull();
		expect(await addEventSet(A, "e1", "l9")).toBeNull();
		expect(await addEventSet(B, "e1", "l1")).toBeNull();
		expect(fake.rows("eventSet")).toHaveLength(1);
	});
	test('"full" at the cap', async () => {
		reset({
			event: [ev("e1", A)],
			setList: [list("l1", A)],
			eventSet: Array.from({ length: MAX_EVENT_SETS }, (_, i) =>
				set(`s${i}`, "e1", "l1", { sortOrder: i }),
			),
		});
		expect(await addEventSet(A, "e1", "l1")).toBe("full");
	});
});

describe("updateEventSetLabel, removeEventSet", () => {
	beforeEach(() =>
		reset({
			event: [ev("e1", A), ev("e2", B)],
			setList: [list("l1", A), list("l9", B)],
			eventSet: [set("s1", "e1", "l1"), set("s9", "e2", "l9")],
		}),
	);
	test("the label changes and the event is touched; another account's set is not found", async () => {
		expect(await updateEventSetLabel(A, "s9", "Encore")).toBeNull();
		expect(await updateEventSetLabel(A, "s1", "Encore")).toMatchObject({
			id: "s1",
			label: "Encore",
			title: "List l1",
		});
		expect(fake.rows("eventSet")[0]).toMatchObject({ label: "Encore" });
		expect(callsTo("update", "event")).toHaveLength(1);
	});
	test("remove takes the set off the event; the set list stays", async () => {
		expect(await removeEventSet(A, "s9")).toBe(false);
		expect(await removeEventSet(A, "s1")).toBe(true);
		expect(fake.rows("eventSet").map((r) => r.id)).toEqual(["s9"]);
		expect(fake.rows("setList")).toHaveLength(2);
	});
});

describe("reorderEventSets", () => {
	beforeEach(() =>
		reset({
			event: [ev("e1", A), ev("e2", B)],
			eventSet: [
				set("s1", "e1", "l1", { sortOrder: 0 }),
				set("s2", "e1", "l1", { sortOrder: 1 }),
				set("s3", "e1", "l2", { sortOrder: 2 }),
				set("s9", "e2", "l9", { sortOrder: 0 }),
			],
		}),
	);
	const order = () =>
		fake
			.rows("eventSet")
			.filter((r) => r.eventId === "e1")
			.sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder))
			.map((r) => r.id);
	test("the sets take the order given; only the moved ones are written", async () => {
		expect(await reorderEventSets(A, "e1", ["s3", "s1", "s2"])).toBe(true);
		expect(order()).toEqual(["s3", "s1", "s2"]);
		expect(callsTo("update", "event_set")).toHaveLength(3);
		expect(callsTo("update", "event")).toHaveLength(1);
	});
	test("false unless the ids are exactly the event's sets, once each, and the event is the account's", async () => {
		for (const ids of [
			["s1", "s2"],
			["s1", "s2", "s3", "s9"],
			["s1", "s2", "s9"],
			["s1", "s1", "s2"],
		])
			expect(await reorderEventSets(A, "e1", ids)).toBe(false);
		expect(await reorderEventSets(B, "e1", ["s1", "s2", "s3"])).toBe(false);
		expect(order()).toEqual(["s1", "s2", "s3"]);
	});
});

describe("linkEventSession", () => {
	beforeEach(() =>
		reset({
			event: [ev("e1", A), ev("e2", A), ev("e9", B)],
			recordingSession: [session("r1", A), session("r2", A, { eventId: "e2" }), session("r9", B)],
		}),
	);
	const eventOf = (id: string) => fake.rows("recordingSession").find((r) => r.id === id)?.eventId;
	test("linking ties the session to the event, moving it from another", async () => {
		expect(await linkEventSession(A, "e1", "r1", true)).toBe(true);
		expect(await linkEventSession(A, "e1", "r2", true)).toBe(true);
		expect(eventOf("r1")).toBe("e1");
		expect(eventOf("r2")).toBe("e1");
	});
	test("unlinking unties it only from this event", async () => {
		expect(await linkEventSession(A, "e1", "r2", false)).toBe(true);
		expect(eventOf("r2")).toBe("e2");
		expect(await linkEventSession(A, "e2", "r2", false)).toBe(true);
		expect(eventOf("r2")).toBeNull();
	});
	test("false for another account's event or session", async () => {
		expect(await linkEventSession(A, "e9", "r1", true)).toBe(false);
		expect(await linkEventSession(A, "e1", "r9", true)).toBe(false);
		expect(await linkEventSession(B, "e1", "r1", true)).toBe(false);
		expect(eventOf("r1")).toBeNull();
		expect(eventOf("r9")).toBeNull();
	});
});
