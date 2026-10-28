import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../../tests/helpers/fakeServerModules";
import { asSignedOut, httpError } from "../../../../tests/helpers/fakeRequestEvent";
import { calendar, resetRemoteMocks } from "../../../../tests/helpers/fakeServerModules";
import { callRoute } from "../../../../tests/helpers/fakeApiEvent";

/** An account's ICS feed: public by its token, a 404 for a token nobody made, never indexed. */
const { GET } = await import("./+server");

const TOKEN = "abcdefghijklmnopqrstuvwx";
const get = () =>
	callRoute(GET, asSignedOut(), new Request(`https://www.stemshovel.com/cal/${TOKEN}.ics`), {
		token: TOKEN,
	});

beforeEach(() => {
	resetRemoteMocks();
	calendar.accountByCalendarToken.mockResolvedValue(null);
	calendar.calendarEvents.mockResolvedValue([]);
});

describe("GET /cal/[token].ics", () => {
	it("404 for a token nobody made, with no events read", async () => {
		await expect(get()).rejects.toMatchObject(httpError(404));
		expect(calendar.accountByCalendarToken).toHaveBeenCalledWith(TOKEN);
		expect(calendar.calendarEvents).not.toHaveBeenCalled();
	});
	it("the account's events as a calendar, inline, privately cached, noindex", async () => {
		calendar.accountByCalendarToken.mockResolvedValue({
			id: "a1",
			slug: "lj",
			name: "Lightning Jar",
		});
		calendar.calendarEvents.mockResolvedValue([
			{
				id: "ev1",
				accountSlug: "lj",
				kind: "show",
				status: "planned",
				title: "Release show",
				startsOn: "2026-11-14",
				startsAt: "20:00",
				endsAt: "",
				place: null,
				venueText: "",
				addressText: "",
				cityText: "",
				updatedAt: new Date(Date.UTC(2026, 9, 28)),
			},
		]);
		const res = await get();
		expect(res.status).toBe(200);
		expect(calendar.calendarEvents).toHaveBeenCalledWith("a1");
		expect(res.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
		expect(res.headers.get("content-disposition")).toBe('inline; filename="lj.ics"');
		expect(res.headers.get("cache-control")).toBe("private, max-age=300");
		expect(res.headers.get("x-robots-tag")).toBe("noindex");
		const body = await res.text();
		expect(body).toContain("X-WR-CALNAME:Lightning Jar\r\n");
		expect(body).toContain("URL:https://www.stemshovel.com/lj/events/ev1\r\n");
	});
});
