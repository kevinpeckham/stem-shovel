import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	USER,
	asEditorOf,
	asOutsider,
	asSignedOut,
	asViewerOf,
	call,
	fakeId,
	httpError,
	redirected,
} from "../../../tests/helpers/fakeRequestEvent";
import { blob, data, givenRow, resetRemoteMocks } from "../../../tests/helpers/fakeServerModules";

/** Authorization of the event remote functions (docs/band-plan.md, "Event"): an editor of the event's account. */
const events = await import("./events.remote");

const EVENT = fakeId("event-one");
const SET = fakeId("set-one");
const OTHER_SET = fakeId("set-two");
const LIST = fakeId("list-one");
const SESSION = fakeId("session-one");
const FILE = fakeId("evfile-one");
const PAYOUT = fakeId("payout-one");
const MEMBER = fakeId("member-one");
const PAYOUT_ROW = {
	id: PAYOUT,
	userId: MEMBER,
	name: "Dana",
	amountCents: 12050,
	note: "",
	sortOrder: 0,
};
const SET_ROW = { id: SET, setListId: LIST, label: "", sortOrder: 0, title: "Main", itemCount: 3 };
const FIELDS = {
	kind: "show",
	title: "Release show",
	status: "confirmed",
	startsOn: "2026-11-20",
	startsAt: "21:00",
	endsAt: "",
	loadInAt: "",
	soundCheckAt: "",
	venue: "The Hall",
	address: "",
	city: "",
	mapUrl: "",
	venueNotes: "",
	notes: "",
};

beforeEach(() => {
	resetRemoteMocks();
	givenRow("event", { accountId: ACCOUNT });
	givenRow("eventSet", { id: SET, event: { accountId: ACCOUNT } });
	givenRow("eventFile", { accountId: ACCOUNT });
	givenRow("eventPayout", { accountId: ACCOUNT });
});

const cases = [
	{
		name: "createEvent",
		fn: events.createEvent,
		input: { accountId: ACCOUNT, kind: "show", startsOn: "2026-11-20", venue: "The Hall" },
		arrange: () => data.createEvent.mockResolvedValue({ id: EVENT }),
		dataFn: "createEvent",
		args: [
			ACCOUNT,
			USER,
			{
				kind: "show",
				title: "",
				startsOn: "2026-11-20",
				venue: "The Hall",
				venueId: "",
				locationId: "",
			},
		],
		redirect: `/slug-acct-one/events/${EVENT}`,
		missing: null,
	},
	{
		name: "updateEvent",
		fn: events.updateEvent,
		input: { id: EVENT, ...FIELDS },
		arrange: () => data.updateEvent.mockResolvedValue({ id: EVENT }),
		dataFn: "updateEvent",
		args: [ACCOUNT, EVENT, FIELDS],
		outcome: { ok: true },
		missing: "event",
	},
	{
		name: "deleteEvent",
		fn: events.deleteEvent,
		input: { id: EVENT },
		arrange: () => data.deleteEvent.mockResolvedValue(true),
		dataFn: "deleteEvent",
		args: [ACCOUNT, EVENT],
		outcome: { deleted: true },
		missing: "event",
	},
	{
		name: "addEventSet",
		fn: events.addEventSet,
		input: { eventId: EVENT, setListId: LIST },
		arrange: () => data.addEventSet.mockResolvedValue(SET_ROW),
		dataFn: "addEventSet",
		args: [ACCOUNT, EVENT, LIST],
		outcome: SET_ROW,
		missing: "event",
	},
	{
		name: "updateEventSetLabel",
		fn: events.updateEventSetLabel,
		input: { id: SET, label: " Encore " },
		arrange: () => data.updateEventSetLabel.mockResolvedValue({ ...SET_ROW, label: "Encore" }),
		dataFn: "updateEventSetLabel",
		args: [ACCOUNT, SET, "Encore"],
		outcome: { ...SET_ROW, label: "Encore" },
		missing: "eventSet",
	},
	{
		name: "removeEventSet",
		fn: events.removeEventSet,
		input: { id: SET },
		arrange: () => data.removeEventSet.mockResolvedValue(true),
		dataFn: "removeEventSet",
		args: [ACCOUNT, SET],
		outcome: { deleted: true },
		missing: "eventSet",
	},
	{
		name: "reorderEventSets",
		fn: events.reorderEventSets,
		input: { eventId: EVENT, ids: [OTHER_SET, SET] },
		arrange: () => data.reorderEventSets.mockResolvedValue(true),
		dataFn: "reorderEventSets",
		args: [ACCOUNT, EVENT, [OTHER_SET, SET]],
		outcome: { ok: true },
		missing: "event",
	},
	{
		name: "linkEventSession",
		fn: events.linkEventSession,
		input: { eventId: EVENT, sessionId: SESSION, linked: true },
		arrange: () => data.linkEventSession.mockResolvedValue(true),
		dataFn: "linkEventSession",
		args: [ACCOUNT, EVENT, SESSION, true],
		outcome: { linked: true },
		missing: "event",
	},
	{
		name: "updateEventFileCaption",
		fn: events.updateEventFileCaption,
		input: { id: FILE, caption: "  Load-in at six " },
		arrange: () => data.updateEventFileCaption.mockResolvedValue({ id: FILE }),
		dataFn: "updateEventFileCaption",
		args: [ACCOUNT, FILE, "Load-in at six"],
		outcome: { ok: true },
		missing: "eventFile",
	},
	{
		name: "deleteEventFile",
		fn: events.deleteEventFile,
		input: { id: FILE },
		arrange: () =>
			data.deleteEventFile.mockResolvedValue({
				url: "https://x/f.png",
				pathname: "f.png",
				thumbnailUrl: "https://x/f.thumb.webp",
				thumbnailPathname: "f.thumb.webp",
			}),
		dataFn: "deleteEventFile",
		args: [ACCOUNT, FILE],
		outcome: { ok: true },
		missing: "eventFile",
	},
	{
		name: "addEventPayout",
		fn: events.addEventPayout,
		input: { eventId: EVENT, userId: MEMBER, amount: "120.50" },
		arrange: () => data.addEventPayout.mockResolvedValue(PAYOUT_ROW),
		dataFn: "addEventPayout",
		args: [ACCOUNT, EVENT, { userId: MEMBER, name: "", amount: 12050, note: "" }],
		outcome: PAYOUT_ROW,
		missing: "event",
	},
	{
		name: "updateEventPayout",
		fn: events.updateEventPayout,
		input: { id: PAYOUT, name: " Sound guy ", amount: "50", note: "cash" },
		arrange: () =>
			data.updateEventPayout.mockResolvedValue({
				...PAYOUT_ROW,
				userId: null,
				name: "Sound guy",
				amountCents: 5000,
				note: "cash",
			}),
		dataFn: "updateEventPayout",
		args: [ACCOUNT, PAYOUT, { userId: "", name: "Sound guy", amount: 5000, note: "cash" }],
		outcome: { ...PAYOUT_ROW, userId: null, name: "Sound guy", amountCents: 5000, note: "cash" },
		missing: "eventPayout",
	},
	{
		name: "removeEventPayout",
		fn: events.removeEventPayout,
		input: { id: PAYOUT },
		arrange: () => data.removeEventPayout.mockResolvedValue(true),
		dataFn: "removeEventPayout",
		args: [ACCOUNT, PAYOUT],
		outcome: { ok: true },
		missing: "eventPayout",
	},
];

for (const c of cases) {
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
		if (c.missing)
			it("404 for a row that does not exist", async () => {
				asEditorOf(ACCOUNT);
				givenRow(c.missing, null);
				await expect(run()).rejects.toMatchObject(httpError(404));
				expect(data[c.dataFn]).not.toHaveBeenCalled();
			});
		it("an editor reaches the data layer scoped by the account", async () => {
			asEditorOf(ACCOUNT);
			if (c.redirect) await expect(run()).rejects.toMatchObject(redirected(c.redirect));
			else await expect(run()).resolves.toEqual(c.outcome);
			expect(data[c.dataFn]).toHaveBeenCalledWith(...c.args);
		});
	});
}

describe("createEvent", () => {
	it("409 when the account holds as many shows and practices as it may", async () => {
		asEditorOf(ACCOUNT);
		data.createEvent.mockResolvedValue(null);
		await expect(
			call(events.createEvent, { accountId: ACCOUNT, kind: "practice", startsOn: "2026-11-20" }),
		).rejects.toMatchObject({
			status: 409,
			body: { message: "This account holds as many shows and practices as it may." },
		});
	});
	it("refuses a day that is not YYYY-MM-DD", async () => {
		asEditorOf(ACCOUNT);
		await expect(
			call(events.createEvent, { accountId: ACCOUNT, kind: "show", startsOn: "Nov 20" }),
		).rejects.toBeTruthy();
		expect(data.createEvent).not.toHaveBeenCalled();
	});
});

describe("venues", () => {
	beforeEach(() => asEditorOf(ACCOUNT));
	const VENUE = fakeId("venue-one");
	it("createEvent passes the venue picked", async () => {
		data.createEvent.mockResolvedValue({ id: EVENT });
		await expect(
			call(events.createEvent, {
				accountId: ACCOUNT,
				kind: "show",
				startsOn: "2026-11-20",
				venueId: VENUE,
			}),
		).rejects.toMatchObject(redirected(`/slug-acct-one/events/${EVENT}`));
		expect(data.createEvent).toHaveBeenCalledWith(ACCOUNT, USER, {
			kind: "show",
			title: "",
			startsOn: "2026-11-20",
			venue: "",
			venueId: VENUE,
			locationId: "",
		});
	});
	it("updateEvent passes the venue, or leaves it out (and the legacy text) when not sent", async () => {
		data.updateEvent.mockResolvedValue({ id: EVENT });
		const rest = {
			kind: "show",
			title: "Release show",
			status: "confirmed",
			startsOn: "2026-11-20",
			startsAt: "21:00",
			endsAt: "",
			loadInAt: "",
			soundCheckAt: "",
			notes: "",
		};
		await call(events.updateEvent, { id: EVENT, ...rest, venueId: VENUE });
		expect(data.updateEvent).toHaveBeenLastCalledWith(ACCOUNT, EVENT, { ...rest, venueId: VENUE });
		await call(events.updateEvent, { id: EVENT, ...rest });
		expect(data.updateEvent).toHaveBeenLastCalledWith(ACCOUNT, EVENT, rest);
	});
});

describe("practice locations", () => {
	beforeEach(() => asEditorOf(ACCOUNT));
	const LOCATION = fakeId("location-one");
	it("createEvent passes the location picked", async () => {
		data.createEvent.mockResolvedValue({ id: EVENT });
		await expect(
			call(events.createEvent, {
				accountId: ACCOUNT,
				kind: "practice",
				startsOn: "2026-11-20",
				locationId: LOCATION,
			}),
		).rejects.toMatchObject(redirected(`/slug-acct-one/events/${EVENT}`));
		expect(data.createEvent).toHaveBeenCalledWith(ACCOUNT, USER, {
			kind: "practice",
			title: "",
			startsOn: "2026-11-20",
			venue: "",
			venueId: "",
			locationId: LOCATION,
		});
	});
	it('updateEvent passes the location, "" to clear it, or leaves it out when not sent', async () => {
		data.updateEvent.mockResolvedValue({ id: EVENT });
		const rest = {
			kind: "practice",
			title: "",
			status: "planned",
			startsOn: "2026-11-20",
			startsAt: "19:00",
			endsAt: "",
			loadInAt: "",
			soundCheckAt: "",
			notes: "",
		};
		await call(events.updateEvent, { id: EVENT, ...rest, locationId: LOCATION });
		expect(data.updateEvent).toHaveBeenLastCalledWith(ACCOUNT, EVENT, {
			...rest,
			locationId: LOCATION,
		});
		await call(events.updateEvent, { id: EVENT, ...rest, locationId: "" });
		expect(data.updateEvent).toHaveBeenLastCalledWith(ACCOUNT, EVENT, { ...rest, locationId: "" });
		await call(events.updateEvent, { id: EVENT, ...rest });
		expect(data.updateEvent).toHaveBeenLastCalledWith(ACCOUNT, EVENT, rest);
	});
	it("refuses a locationId that is not an id", async () => {
		await expect(
			call(events.createEvent, {
				accountId: ACCOUNT,
				kind: "practice",
				startsOn: "2026-11-20",
				locationId: "the garage!",
			}),
		).rejects.toBeTruthy();
		expect(data.createEvent).not.toHaveBeenCalled();
	});
});

describe("the data layer finding nothing", () => {
	beforeEach(() => asEditorOf(ACCOUNT));
	it("updateEvent answers 404", async () => {
		data.updateEvent.mockResolvedValue(null);
		await expect(call(events.updateEvent, { id: EVENT, ...FIELDS })).rejects.toMatchObject(
			httpError(404),
		);
	});
	it("deleteEvent answers 404", async () => {
		data.deleteEvent.mockResolvedValue(false);
		await expect(call(events.deleteEvent, { id: EVENT })).rejects.toMatchObject(httpError(404));
	});
	it("addEventSet answers 404 for a set list not the account's, 409 when full", async () => {
		data.addEventSet.mockResolvedValue(null);
		await expect(
			call(events.addEventSet, { eventId: EVENT, setListId: LIST }),
		).rejects.toMatchObject(httpError(404));
		data.addEventSet.mockResolvedValue("full");
		await expect(
			call(events.addEventSet, { eventId: EVENT, setListId: LIST }),
		).rejects.toMatchObject({
			status: 409,
			body: { message: "This show has as many sets as it may." },
		});
	});
	it("updateEventSetLabel and removeEventSet answer 404", async () => {
		data.updateEventSetLabel.mockResolvedValue(null);
		await expect(call(events.updateEventSetLabel, { id: SET, label: "x" })).rejects.toMatchObject(
			httpError(404),
		);
		data.removeEventSet.mockResolvedValue(false);
		await expect(call(events.removeEventSet, { id: SET })).rejects.toMatchObject(httpError(404));
	});
	it("reorderEventSets answers 400 when the ids are not exactly the event's sets", async () => {
		data.reorderEventSets.mockResolvedValue(false);
		await expect(
			call(events.reorderEventSets, { eventId: EVENT, ids: [SET] }),
		).rejects.toMatchObject({
			status: 400,
			body: { message: "The sets changed; reload the page and try again." },
		});
	});
	it("linkEventSession answers 404 for a session not the account's, and passes an unlink", async () => {
		data.linkEventSession.mockResolvedValue(false);
		await expect(
			call(events.linkEventSession, { eventId: EVENT, sessionId: SESSION, linked: true }),
		).rejects.toMatchObject(httpError(404));
		data.linkEventSession.mockResolvedValue(true);
		await expect(
			call(events.linkEventSession, { eventId: EVENT, sessionId: SESSION, linked: false }),
		).resolves.toEqual({ linked: false });
		expect(data.linkEventSession).toHaveBeenLastCalledWith(ACCOUNT, EVENT, SESSION, false);
	});
});

describe("event files", () => {
	beforeEach(() => asEditorOf(ACCOUNT));
	it("deleteEventFile removes the file and its thumbnail from the store", async () => {
		data.deleteEventFile.mockResolvedValue({
			url: "https://x/f.png",
			pathname: "f.png",
			thumbnailUrl: null,
			thumbnailPathname: null,
		});
		await expect(call(events.deleteEventFile, { id: FILE })).resolves.toEqual({ ok: true });
		expect(blob.deleteBlobs).toHaveBeenCalledWith(["https://x/f.png", ""]);
	});
	it("deleteEventFile and updateEventFileCaption answer 404 when the data layer finds nothing; no blob is touched", async () => {
		data.deleteEventFile.mockResolvedValue(null);
		await expect(call(events.deleteEventFile, { id: FILE })).rejects.toMatchObject(httpError(404));
		expect(blob.deleteBlobs).not.toHaveBeenCalled();
		data.updateEventFileCaption.mockResolvedValue(null);
		await expect(
			call(events.updateEventFileCaption, { id: FILE, caption: "x" }),
		).rejects.toMatchObject(httpError(404));
	});
	it("a caption over 300 characters is refused before the data layer", async () => {
		await expect(
			call(events.updateEventFileCaption, { id: FILE, caption: "x".repeat(301) }),
		).rejects.toBeTruthy();
		expect(data.updateEventFileCaption).not.toHaveBeenCalled();
	});
});

describe("event payouts", () => {
	beforeEach(() => asEditorOf(ACCOUNT));
	it("addEventPayout answers 400 for a userId that is not a member of the account", async () => {
		data.addEventPayout.mockResolvedValue("not-member");
		await expect(
			call(events.addEventPayout, { eventId: EVENT, userId: MEMBER, amount: "10" }),
		).rejects.toMatchObject({ status: 400, body: { message: "Not a member" } });
	});
	it("updateEventPayout answers 400 for a userId that is not a member of the account", async () => {
		data.updateEventPayout.mockResolvedValue("not-member");
		await expect(
			call(events.updateEventPayout, { id: PAYOUT, userId: MEMBER, amount: "10" }),
		).rejects.toMatchObject({ status: 400, body: { message: "Not a member" } });
	});
	it("addEventPayout answers 409 at the cap", async () => {
		data.addEventPayout.mockResolvedValue("full");
		await expect(
			call(events.addEventPayout, { eventId: EVENT, name: "Gas", amount: "10" }),
		).rejects.toMatchObject({
			status: 409,
			body: { message: "This show has as many payouts as it may." },
		});
	});
	it("the data layer finding nothing answers 404", async () => {
		data.addEventPayout.mockResolvedValue(null);
		await expect(
			call(events.addEventPayout, { eventId: EVENT, name: "Gas", amount: "10" }),
		).rejects.toMatchObject(httpError(404));
		data.updateEventPayout.mockResolvedValue(null);
		await expect(
			call(events.updateEventPayout, { id: PAYOUT, name: "Gas", amount: "10" }),
		).rejects.toMatchObject(httpError(404));
		data.removeEventPayout.mockResolvedValue(false);
		await expect(call(events.removeEventPayout, { id: PAYOUT })).rejects.toMatchObject(
			httpError(404),
		);
	});
	it("a payout needs a member or a name, and an amount, before the data layer", async () => {
		await expect(
			call(events.addEventPayout, { eventId: EVENT, userId: "", name: " ", amount: "10" }),
		).rejects.toBeTruthy();
		await expect(call(events.updateEventPayout, { id: PAYOUT, amount: "10" })).rejects.toBeTruthy();
		await expect(
			call(events.addEventPayout, { eventId: EVENT, name: "Gas", amount: "" }),
		).rejects.toBeTruthy();
		expect(data.addEventPayout).not.toHaveBeenCalled();
		expect(data.updateEventPayout).not.toHaveBeenCalled();
	});
	it("updateEvent passes the books, with the take in cents", async () => {
		data.updateEvent.mockResolvedValue({ id: EVENT });
		await call(events.updateEvent, {
			id: EVENT,
			...FIELDS,
			ticketPrice: "$10",
			ticketsSold: "",
			attendance: "120",
			take: "450.50",
		});
		expect(data.updateEvent).toHaveBeenLastCalledWith(ACCOUNT, EVENT, {
			...FIELDS,
			ticketPrice: "$10",
			ticketsSold: null,
			attendance: 120,
			take: 45050,
		});
	});
});
