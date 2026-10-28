import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	asMemberOf,
	asOutsider,
	asSignedOut,
	asViewerOf,
	call,
	httpError,
} from "../../../tests/helpers/fakeRequestEvent";
import { calendar, resetRemoteMocks } from "../../../tests/helpers/fakeServerModules";

/** The calendar feed's address (docs/band-plan.md, "Pages"): any member of the account gets it, with the account's token. */
const remote = await import("./calendar.remote");

const TOKEN = "t".repeat(24);

beforeEach(() => {
	resetRemoteMocks();
	calendar.calendarTokenOf.mockResolvedValue(TOKEN);
});

describe("calendarFeedUrl", () => {
	it("401 signed out", async () => {
		asSignedOut();
		await expect(call(remote.calendarFeedUrl, { accountId: ACCOUNT })).rejects.toMatchObject(
			httpError(401),
		);
		expect(calendar.calendarTokenOf).not.toHaveBeenCalled();
	});
	it("404 for someone outside the account", async () => {
		asOutsider();
		await expect(call(remote.calendarFeedUrl, { accountId: ACCOUNT })).rejects.toMatchObject(
			httpError(404),
		);
		expect(calendar.calendarTokenOf).not.toHaveBeenCalled();
	});
	it("a member, a viewer too, gets the feed's path", async () => {
		asMemberOf(ACCOUNT);
		await expect(call(remote.calendarFeedUrl, { accountId: ACCOUNT })).resolves.toEqual({
			url: `/cal/${TOKEN}.ics`,
		});
		expect(calendar.calendarTokenOf).toHaveBeenCalledWith(ACCOUNT);
		asViewerOf(ACCOUNT);
		await expect(call(remote.calendarFeedUrl, { accountId: ACCOUNT })).resolves.toEqual({
			url: `/cal/${TOKEN}.ics`,
		});
	});
});
