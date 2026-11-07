import { beforeEach, describe, expect, test } from "vite-plus/test";
import { MAX_CONTACTS_PER_ACCOUNT } from "#lib/constants/contacts.js";
import { callsTo, fake, reset } from "../../../tests/helpers/fakeDataLayer";

const {
	contactChoices,
	createContact,
	deleteContact,
	eventPage,
	findContact,
	listContacts,
	listEvents,
	listMemberProfiles,
	updateContact,
	updateEvent,
	updateMemberProfile,
} = await import("./data");

/** The band directory (docs/band-plan.md, "The band directory"): contacts, a show's promoter from them, and member profiles. */
const A = "acct-one____________";
const B = "acct-two____________";
const U = "user-one____________";
const U2 = "user-two____________";
const at = (iso: string) => new Date(iso);

const person = (
	id: string,
	accountId: string,
	name: string,
	over: Record<string, unknown> = {},
) => ({
	id,
	accountId,
	name,
	role: "",
	phone: "",
	email: "",
	address: "",
	notes: "",
	createdBy: U,
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
	locationId: null,
	promoterContactId: null,
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
const fields = (name: string, over: Partial<Record<string, string>> = {}) => ({
	name,
	role: "",
	phone: "",
	email: "",
	address: "",
	notes: "",
	...over,
});

describe("listContacts, contactChoices, findContact", () => {
	beforeEach(() =>
		reset({
			contact: [
				person("c1", A, "sam", { role: "Promoter", phone: "555-0100", notes: "Pays cash" }),
				person("c2", A, "Dana", { email: "dana@example.com" }),
				person("c3", B, "B's agent"),
			],
			event: [
				ev("e1", A, { promoterContactId: "c1" }),
				ev("e2", A, { promoterContactId: "c1" }),
				// Another account's event naming this contact (it should not) does not count.
				ev("e3", B, { promoterContactId: "c1" }),
			],
		}),
	);
	test("the account's contacts by name, case-insensitively, with the shows naming them", async () => {
		const rows = await listContacts(A);
		expect(rows.map((r) => [r.id, r.eventCount])).toEqual([
			["c2", 0],
			["c1", 2],
		]);
		expect(rows[1]).toEqual({
			id: "c1",
			name: "sam",
			role: "Promoter",
			phone: "555-0100",
			email: "",
			address: "",
			notes: "Pays cash",
			eventCount: 2,
		});
		expect((await listContacts(B)).map((r) => r.id)).toEqual(["c3"]);
	});
	test("choices: how to reach them, by name", async () => {
		expect(await contactChoices(A)).toEqual([
			{ id: "c2", name: "Dana", role: "", phone: "", email: "dana@example.com" },
			{ id: "c1", name: "sam", role: "Promoter", phone: "555-0100", email: "" },
		]);
	});
	test("find: the account's own, else null", async () => {
		expect(await findContact(A, "c1")).toMatchObject({ id: "c1", eventCount: 2 });
		expect(await findContact(B, "c1")).toBeNull();
		expect(await findContact(A, "nope")).toBeNull();
	});
});

describe("createContact", () => {
	test("a new contact in the account, marked with who made it; two of a name are fine", async () => {
		reset({ contact: [person("c1", A, "Sam")] });
		const r = await createContact(A, U, fields(" Sam ", { role: "Sound engineer" }));
		expect(r).toMatchObject({ name: "Sam", role: "Sound engineer", eventCount: 0 });
		expect(fake.rows("contact")).toHaveLength(2);
		expect(fake.rows("contact")[1]).toMatchObject({ accountId: A, name: "Sam", createdBy: U });
	});
	test('"full" at the cap, before anything is written', async () => {
		reset({
			contact: Array.from({ length: MAX_CONTACTS_PER_ACCOUNT }, (_, i) =>
				person(`c${i}`, A, `Person ${i}`),
			),
		});
		expect(await createContact(A, U, fields("One more"))).toBe("full");
		expect(fake.rows("contact")).toHaveLength(MAX_CONTACTS_PER_ACCOUNT);
		expect(await createContact(B, U, fields("One more"))).toMatchObject({ name: "One more" });
	});
});

describe("updateContact", () => {
	beforeEach(() => reset({ contact: [person("c1", A, "Sam"), person("c2", B, "Theirs")] }));
	test("every field; the row back", async () => {
		expect(
			await updateContact(A, "c1", fields("Sam Ortiz", { phone: "555-0199", notes: "Texts" })),
		).toMatchObject({ id: "c1", name: "Sam Ortiz", phone: "555-0199", notes: "Texts" });
		expect(fake.rows("contact")[0]).toMatchObject({ name: "Sam Ortiz", phone: "555-0199" });
	});
	test("null when not the account's, with nothing written", async () => {
		expect(await updateContact(A, "c2", fields("X"))).toBeNull();
		expect(await updateContact(A, "nope", fields("X"))).toBeNull();
		expect(callsTo("update", "contact")).toHaveLength(0);
	});
});

describe("deleteContact", () => {
	beforeEach(() =>
		reset({
			contact: [person("c1", A, "Sam"), person("c2", B, "Theirs")],
			event: [
				ev("e1", A, { promoterContactId: "c1", promoter: "Sam's Nights" }),
				ev("e2", A, { promoterContactId: null }),
				ev("e3", B, { promoterContactId: "c1" }),
			],
		}),
	);
	test("gone even while shows name it; the account's shows lose the link and keep their text", async () => {
		expect(await deleteContact(A, "c1")).toBe(true);
		expect(fake.rows("contact").map((r) => r.id)).toEqual(["c2"]);
		const events = fake.rows("event");
		expect(events[0]).toMatchObject({ promoterContactId: null, promoter: "Sam's Nights" });
		// Another account's row is not this delete's to touch.
		expect(events[2]).toMatchObject({ promoterContactId: "c1" });
	});
	test("false when not the account's", async () => {
		expect(await deleteContact(A, "c2")).toBe(false);
		expect(await deleteContact(A, "nope")).toBe(false);
		expect(fake.rows("contact")).toHaveLength(2);
	});
});

describe("events with a promoter contact", () => {
	beforeEach(() =>
		reset({
			contact: [person("c1", A, "Sam"), person("c2", A, "Dana"), person("c3", B, "Theirs")],
			event: [ev("e1", A, { promoterContactId: "c1" }), ev("e2", A)],
		}),
	);
	test("listEvents filters by the contact", async () => {
		expect((await listEvents(A, "show", { contactId: "c1" })).map((r) => r.id)).toEqual(["e1"]);
		expect((await listEvents(A, "show")).map((r) => r.id)).toEqual(["e1", "e2"]);
	});
	test("eventPage carries the contact id and the account's choices", async () => {
		const page = await eventPage(A, "e1");
		expect(page?.event.promoterContactId).toBe("c1");
		expect(page?.contacts.map((c) => c.id)).toEqual(["c2", "c1"]);
	});
	const show = {
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
	test("updateEvent sets, clears or keeps the contact; another account's or an unknown one leaves it", async () => {
		expect(await updateEvent(A, "e1", show)).toMatchObject({ promoterContactId: "c1" });
		expect(await updateEvent(A, "e1", { ...show, promoterContactId: "c3" })).toMatchObject({
			promoterContactId: "c1",
		});
		expect(await updateEvent(A, "e1", { ...show, promoterContactId: "nope" })).toMatchObject({
			promoterContactId: "c1",
		});
		expect(await updateEvent(A, "e1", { ...show, promoterContactId: "c2" })).toMatchObject({
			promoterContactId: "c2",
		});
		expect(await updateEvent(A, "e1", { ...show, promoterContactId: "" })).toMatchObject({
			promoterContactId: null,
		});
	});
});

describe("listMemberProfiles, updateMemberProfile", () => {
	beforeEach(() =>
		reset({
			user: [
				{ id: U, name: "zoe", email: "zoe@example.com" },
				{ id: U2, name: "Alex", email: "alex@example.com" },
			],
			accountMember: [
				{
					id: "m1",
					accountId: A,
					userId: U,
					role: "owner",
					phone: "555-0100",
					instruments: "drums",
					notes: "",
				},
				{
					id: "m2",
					accountId: A,
					userId: U2,
					role: "member",
					phone: "",
					instruments: "",
					notes: "",
				},
				{
					id: "m3",
					accountId: B,
					userId: U,
					role: "member",
					phone: "",
					instruments: "",
					notes: "",
				},
			],
		}),
	);
	test("every member of the account with their profile, by name", async () => {
		expect(await listMemberProfiles(A)).toEqual([
			{
				userId: U2,
				name: "Alex",
				email: "alex@example.com",
				role: "member",
				phone: "",
				instruments: "",
				notes: "",
			},
			{
				userId: U,
				name: "zoe",
				email: "zoe@example.com",
				role: "owner",
				phone: "555-0100",
				instruments: "drums",
				notes: "",
			},
		]);
	});
	test("the profile in this account only; the row back", async () => {
		const profile = { phone: "555-0123", instruments: "guitar, vocals", notes: "Has the van" };
		expect(await updateMemberProfile(A, U2, profile)).toMatchObject({ userId: U2, ...profile });
		expect(fake.rows("accountMember")[1]).toMatchObject(profile);
		expect(fake.rows("accountMember")[2]).toMatchObject({ phone: "", instruments: "" });
	});
	test("null when the user is not a member of the account", async () => {
		const profile = { phone: "1", instruments: "", notes: "" };
		expect(await updateMemberProfile(B, U2, profile)).toBeNull();
		expect(fake.rows("accountMember")[1]).toMatchObject({ phone: "" });
	});
});
