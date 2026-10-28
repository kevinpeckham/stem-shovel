import { command, getRequestEvent } from "$app/server";
import { requireMember } from "#lib/server/access.js";
import { calendarTokenOf } from "#lib/server/calendar.js";
import { CalendarFeedSchema } from "#lib/val/CalendarFeedSchema.js";

/**
 * The address of an account's calendar feed (docs/band-plan.md, "Pages"),
 * for a member to paste into a calendar app: the path with the account's
 * token, made on first ask. Anyone with the address can read the feed, as
 * with a share link; a non-member gets a 404.
 */
export const calendarFeedUrl = command(CalendarFeedSchema, async ({ accountId }) => {
	const { locals } = getRequestEvent();
	requireMember(locals, accountId);
	const token = await calendarTokenOf(accountId);
	return { url: `/cal/${token}.ics` };
});
