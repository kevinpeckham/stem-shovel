import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Row } from "../../../tests/helpers/fakeDb";
import { fake, reset } from "../../../tests/helpers/fakeDataLayer";

// The database is fakeDb; the reminder itself (notifications.ts) and the error reporter are doubles.
const notifications = vi.hoisted(() => ({ notifyEventReminder: vi.fn(async (_id: string) => {}) }));
vi.mock("#lib/server/notifications.js", () => notifications);
const reported = vi.hoisted(() => ({ reportError: vi.fn() }));
vi.mock("#lib/server/reportError.js", () => reported);

const {
	accountByCalendarToken,
	calendarEvents,
	calendarTokenOf,
	eventsStartingOn,
	sendEventReminders,
	upcomingEvents,
} = await import("./calendar");

const a1 = { id: "a1", name: "Lightning Jar", slug: "lj", calendarToken: null };
const a2 = { id: "a2", name: "Night Shift", slug: "ns", calendarToken: "tok-a2" };
const echo = { id: "v1", name: "The Echo", address: "1822 Sunset Blvd", city: "Los Angeles" };
const garage = { id: "l1", accountId: "a1", name: "Garage", address: "12 Elm St" };

const ev = (id: string, over: Row = {}): Row => ({
	id,
	accountId: "a1",
	kind: "show",
	title: "",
	status: "planned",
	startsOn: "2026-11-01",
	startsAt: "",
	endsAt: "",
	venueId: null,
	locationId: null,
	venue: "",
	address: "",
	city: "",
	createdAt: new Date(Date.UTC(2026, 9, 1)),
	updatedAt: new Date(Date.UTC(2026, 9, 2)),
	...over,
});
const poster = (id: string, eventId: string, over: Row = {}): Row => ({
	id,
	accountId: "a1",
	eventId,
	kind: "poster",
	status: "ready",
	url: `https://blob/${id}.pdf`,
	thumbnailUrl: `https://blob/${id}-thumb.webp`,
	contentType: "application/pdf",
	createdAt: new Date(Date.UTC(2026, 9, 3)),
	...over,
});

const base = (over: Record<string, Row[]> = {}) => ({
	account: [a1, a2],
	venue: [echo],
	practiceLocation: [garage],
	...over,
});

beforeEach(() => {
	reset(base());
	notifications.notifyEventReminder.mockReset();
	reported.reportError.mockReset();
});

describe("upcomingEvents", () => {
	it("from today on, soonest first then by time, these accounts only, canceled left out, capped", async () => {
		reset(
			base({
				event: [
					ev("past", { startsOn: "2026-10-27" }),
					ev("late", { startsOn: "2026-10-28", startsAt: "21:00" }),
					ev("early", { startsOn: "2026-10-28", startsAt: "19:00" }),
					ev("next", { startsOn: "2026-11-05" }),
					ev("off", { startsOn: "2026-10-30", status: "canceled" }),
					ev("theirs", { accountId: "a2", startsOn: "2026-10-29" }),
				],
			}),
		);
		const rows = await upcomingEvents(["a1"], "2026-10-28");
		expect(rows.map((r) => r.id)).toEqual(["early", "late", "next"]);
		expect((await upcomingEvents(["a1", "a2"], "2026-10-28", 2)).map((r) => r.id)).toEqual([
			"early",
			"late",
		]);
		expect(await upcomingEvents([], "2026-10-28")).toEqual([]);
	});
	it("names the account and the place, and shows the ready poster's picture", async () => {
		reset(
			base({
				event: [
					ev("show", { title: "Release show", startsAt: "20:00", venueId: "v1" }),
					ev("prac", { kind: "practice", startsOn: "2026-11-02", locationId: "l1" }),
					ev("old", { startsOn: "2026-11-03", venue: "Old Hall" }),
					ev("img", { startsOn: "2026-11-04" }),
				],
				eventFile: [
					poster("p1", "show"),
					poster("p2", "prac", { status: "uploading" }),
					poster("p3", "img", {
						thumbnailUrl: null,
						url: "https://blob/p3.jpg",
						contentType: "image/jpeg",
					}),
					poster("p4", "old", { thumbnailUrl: null }),
				],
			}),
		);
		const rows = await upcomingEvents(["a1"], "2026-10-28");
		expect(rows[0]).toEqual({
			id: "show",
			accountSlug: "lj",
			accountName: "Lightning Jar",
			kind: "show",
			title: "Release show",
			startsOn: "2026-11-01",
			startsAt: "20:00",
			place: "The Echo",
			posterThumbnailUrl: "https://blob/p1-thumb.webp",
		});
		expect(rows.map((r) => [r.place, r.posterThumbnailUrl])).toEqual([
			["The Echo", "https://blob/p1-thumb.webp"],
			["Garage", null],
			["Old Hall", null],
			["", "https://blob/p3.jpg"],
		]);
	});
});

describe("day-before reminders", () => {
	it("eventsStartingOn: every account's events on the day, canceled left out", async () => {
		reset(
			base({
				event: [
					ev("a", { startsOn: "2026-10-29" }),
					ev("b", { accountId: "a2", startsOn: "2026-10-29" }),
					ev("c", { startsOn: "2026-10-29", status: "canceled" }),
					ev("d", { startsOn: "2026-10-30" }),
				],
			}),
		);
		expect((await eventsStartingOn("2026-10-29")).sort()).toEqual(["a", "b"]);
	});
	it("sendEventReminders: one reminder per event; a failure is reported and the rest go on", async () => {
		reset(
			base({
				event: [
					ev("a", { startsOn: "2026-10-29" }),
					ev("b", { accountId: "a2", startsOn: "2026-10-29" }),
				],
			}),
		);
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const failure = new Error("mail down");
			notifications.notifyEventReminder.mockImplementation(async (id: string) => {
				if (id === "a") throw failure;
			});
			await expect(sendEventReminders("2026-10-29")).resolves.toBe(1);
			expect(notifications.notifyEventReminder.mock.calls.map((c) => c[0]).sort()).toEqual([
				"a",
				"b",
			]);
			expect(reported.reportError).toHaveBeenCalledWith(
				failure,
				{ job: "event-reminders" },
				{ eventId: "a" },
			);
		} finally {
			log.mockRestore();
		}
	});
	it("sendEventReminders never throws, even when the lookup fails", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const spy = vi.spyOn(fake.query.event, "findMany").mockRejectedValueOnce(new Error("busy"));
		try {
			await expect(sendEventReminders("2026-10-29")).resolves.toBe(0);
			expect(reported.reportError).toHaveBeenCalledTimes(1);
			expect(notifications.notifyEventReminder).not.toHaveBeenCalled();
		} finally {
			spy.mockRestore();
			log.mockRestore();
		}
	});
});

describe("the calendar feed", () => {
	it("calendarTokenOf makes a 24-character token once and keeps it", async () => {
		const token = await calendarTokenOf("a1");
		expect(token).toMatch(/^[\w-]{24}$/);
		expect(await calendarTokenOf("a1")).toBe(token);
		expect(await calendarTokenOf("a2")).toBe("tok-a2");
	});
	it("accountByCalendarToken finds the account, or null", async () => {
		expect(await accountByCalendarToken("tok-a2")).toEqual({
			id: "a2",
			slug: "ns",
			name: "Night Shift",
		});
		expect(await accountByCalendarToken("nobody")).toBeNull();
		expect(await accountByCalendarToken("")).toBeNull();
	});
	it("calendarEvents: every event of the account, past and future and canceled, with where it is", async () => {
		reset(
			base({
				event: [
					ev("show", {
						title: "Release show",
						startsOn: "2026-11-01",
						startsAt: "20:00",
						endsAt: "23:00",
						venueId: "v1",
					}),
					ev("past", { startsOn: "2026-01-01", venue: "Old Hall", city: "Reno", status: "played" }),
					ev("prac", { kind: "practice", startsOn: "2026-11-02", locationId: "l1" }),
					ev("off", { startsOn: "2026-11-03", status: "canceled" }),
					ev("theirs", { accountId: "a2" }),
				],
			}),
		);
		const rows = await calendarEvents("a1");
		expect(rows.map((r) => r.id)).toEqual(["past", "show", "prac", "off"]);
		expect(rows[1]).toEqual({
			id: "show",
			accountSlug: "lj",
			kind: "show",
			status: "planned",
			title: "Release show",
			startsOn: "2026-11-01",
			startsAt: "20:00",
			endsAt: "23:00",
			place: { name: "The Echo", address: "1822 Sunset Blvd", city: "Los Angeles" },
			venueText: "",
			addressText: "",
			cityText: "",
			updatedAt: new Date(Date.UTC(2026, 9, 2)),
		});
		expect(rows[0]).toMatchObject({ place: null, venueText: "Old Hall", cityText: "Reno" });
		expect(rows[2].place).toEqual({ name: "Garage", address: "12 Elm St", city: "" });
	});
});
