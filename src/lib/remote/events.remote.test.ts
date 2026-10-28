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
import { data, givenRow, resetRemoteMocks } from "../../../tests/helpers/fakeServerModules";

/** Authorization of the event remote functions (docs/band-plan.md, "Event"): an editor of the event's account. */
const events = await import("./events.remote");

const EVENT = fakeId("event-one");
const SET = fakeId("set-one");
const OTHER_SET = fakeId("set-two");
const LIST = fakeId("list-one");
const SESSION = fakeId("session-one");
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
});

const cases = [
	{
		name: "createEvent",
		fn: events.createEvent,
		input: { accountId: ACCOUNT, kind: "show", startsOn: "2026-11-20", venue: "The Hall" },
		arrange: () => data.createEvent.mockResolvedValue({ id: EVENT }),
		dataFn: "createEvent",
		args: [ACCOUNT, USER, { kind: "show", title: "", startsOn: "2026-11-20", venue: "The Hall" }],
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
