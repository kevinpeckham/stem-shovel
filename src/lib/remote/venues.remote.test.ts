import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	OTHER_USER,
	USER,
	asEditorOf,
	asOutsider,
	asSignedOut,
	asViewerOf,
	call,
	fakeId,
	httpError,
} from "../../../tests/helpers/fakeRequestEvent";
import { data, resetRemoteMocks } from "../../../tests/helpers/fakeServerModules";

/** Authorization of the venue remote functions (docs/band-plan.md, "Event"): the account's list is its editors'; the shared directory is anyone's signed in. */
const venues = await import("./venues.remote");

const VENUE = fakeId("venue-one");
const ROW = {
	id: VENUE,
	name: "The Hall",
	address: "",
	city: "Austin",
	mapUrl: "",
	websiteUrl: "",
	notes: "",
	contact: "",
	eventCount: 0,
	createdAt: new Date(0),
	updatedAt: new Date(0),
};
const FACTS = { name: "The Hall", address: "", city: "Austin", mapUrl: "", websiteUrl: "" };

beforeEach(() => resetRemoteMocks());

/** The functions on the account's list: an editor of the account named in the input. */
const accountCases = [
	{
		name: "createVenue",
		fn: venues.createVenue,
		input: { accountId: ACCOUNT, name: " The Hall ", city: "Austin" },
		arrange: () => data.createVenue.mockResolvedValue({ venue: ROW, created: true }),
		dataFn: "createVenue",
		args: [ACCOUNT, USER, FACTS],
		outcome: ROW,
	},
	{
		name: "linkVenue",
		fn: venues.linkVenue,
		input: { accountId: ACCOUNT, venueId: VENUE },
		arrange: () => data.linkVenue.mockResolvedValue(ROW),
		dataFn: "linkVenue",
		args: [ACCOUNT, VENUE],
		outcome: ROW,
	},
	{
		name: "unlinkVenue",
		fn: venues.unlinkVenue,
		input: { accountId: ACCOUNT, venueId: VENUE },
		arrange: () => data.unlinkVenue.mockResolvedValue(true),
		dataFn: "unlinkVenue",
		args: [ACCOUNT, VENUE],
		outcome: { ok: true },
	},
	{
		name: "updateVenueNotes",
		fn: venues.updateVenueNotes,
		input: { accountId: ACCOUNT, venueId: VENUE, notes: " Back door ", contact: "Sam" },
		arrange: () => data.updateVenueNotes.mockResolvedValue(true),
		dataFn: "updateVenueNotes",
		args: [ACCOUNT, VENUE, { notes: "Back door", contact: "Sam" }],
		outcome: { ok: true },
	},
];

for (const c of accountCases) {
	const run = () => {
		c.arrange();
		return call(c.fn, c.input);
	};
	describe(c.name, () => {
		it("401 signed out", async () => {
			asSignedOut();
			await expect(run()).rejects.toMatchObject(httpError(401));
			expect(data[c.dataFn]).not.toHaveBeenCalled();
		});
		it("404 for a member of another account", async () => {
			asOutsider();
			await expect(run()).rejects.toMatchObject(httpError(404));
			expect(data[c.dataFn]).not.toHaveBeenCalled();
		});
		it("404 for a viewer of the account", async () => {
			asViewerOf(ACCOUNT);
			await expect(run()).rejects.toMatchObject(httpError(404));
			expect(data[c.dataFn]).not.toHaveBeenCalled();
		});
		it("an editor reaches the data layer scoped by the account", async () => {
			asEditorOf(ACCOUNT);
			await expect(run()).resolves.toEqual(c.outcome);
			expect(data[c.dataFn]).toHaveBeenCalledWith(...c.args);
		});
	});
}

describe("the shared directory: anyone signed in", () => {
	it("updateVenue and searchVenues answer 401 signed out", async () => {
		asSignedOut();
		await expect(call(venues.updateVenue, { id: VENUE, ...FACTS })).rejects.toMatchObject(
			httpError(401),
		);
		await expect(call(venues.searchVenues, { q: "hall" })).rejects.toMatchObject(httpError(401));
		expect(data.updateVenue).not.toHaveBeenCalled();
		expect(data.searchVenues).not.toHaveBeenCalled();
	});
	it("a member of another account may correct a venue's facts, marked as theirs", async () => {
		asOutsider();
		data.updateVenue.mockResolvedValue(true);
		await expect(call(venues.updateVenue, { id: VENUE, ...FACTS })).resolves.toEqual({ ok: true });
		expect(data.updateVenue).toHaveBeenCalledWith(OTHER_USER, VENUE, FACTS);
	});
	it("updateVenue: a duplicate lands on the name; no such venue is 404", async () => {
		asEditorOf(ACCOUNT);
		data.updateVenue.mockResolvedValue("duplicate");
		await expect(call(venues.updateVenue, { id: VENUE, ...FACTS })).rejects.toMatchObject({
			issues: [{ path: ["name"], message: "A venue with that name is already in that city." }],
		});
		data.updateVenue.mockResolvedValue(false);
		await expect(call(venues.updateVenue, { id: VENUE, ...FACTS })).rejects.toMatchObject(
			httpError(404),
		);
	});
	it("searchVenues hands the trimmed words to the data layer", async () => {
		asViewerOf(ACCOUNT);
		const found = [{ id: VENUE, name: "The Hall", city: "Austin" }];
		data.searchVenues.mockResolvedValue(found);
		await expect(call(venues.searchVenues, { q: "  hall " })).resolves.toEqual(found);
		expect(data.searchVenues).toHaveBeenCalledWith("hall");
	});
});

describe("refusals from the data layer", () => {
	beforeEach(() => asEditorOf(ACCOUNT));
	it("createVenue and linkVenue answer 409 when the list is full", async () => {
		const full = { status: 409, body: { message: "This account's venue list is full." } };
		data.createVenue.mockResolvedValue("full");
		await expect(
			call(venues.createVenue, { accountId: ACCOUNT, name: "The Hall" }),
		).rejects.toMatchObject(full);
		data.linkVenue.mockResolvedValue("full");
		await expect(
			call(venues.linkVenue, { accountId: ACCOUNT, venueId: VENUE }),
		).rejects.toMatchObject(full);
	});
	it("createVenue returns the existing venue it linked", async () => {
		data.createVenue.mockResolvedValue({ venue: ROW, created: false });
		await expect(
			call(venues.createVenue, { accountId: ACCOUNT, name: "the hall", city: "austin" }),
		).resolves.toEqual(ROW);
	});
	it("a blank name is refused before the data layer", async () => {
		await expect(call(venues.createVenue, { accountId: ACCOUNT, name: " " })).rejects.toBeTruthy();
		expect(data.createVenue).not.toHaveBeenCalled();
	});
	it("linkVenue, unlinkVenue and updateVenueNotes answer 404 for no such venue", async () => {
		const input = { accountId: ACCOUNT, venueId: VENUE };
		data.linkVenue.mockResolvedValue(null);
		await expect(call(venues.linkVenue, input)).rejects.toMatchObject(httpError(404));
		data.unlinkVenue.mockResolvedValue(false);
		await expect(call(venues.unlinkVenue, input)).rejects.toMatchObject(httpError(404));
		data.updateVenueNotes.mockResolvedValue(false);
		await expect(call(venues.updateVenueNotes, input)).rejects.toMatchObject(httpError(404));
	});
	it("unlinkVenue answers 409 while the account's events are there", async () => {
		data.unlinkVenue.mockResolvedValue("used");
		await expect(
			call(venues.unlinkVenue, { accountId: ACCOUNT, venueId: VENUE }),
		).rejects.toMatchObject({
			status: 409,
			body: { message: "This venue has shows or practices on the calendar; move them first." },
		});
	});
});
