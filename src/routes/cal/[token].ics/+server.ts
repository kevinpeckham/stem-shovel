import { accountByCalendarToken, calendarEvents } from "#lib/server/calendar.js";
import { icsCalendar } from "#lib/utils/icsCalendar.js";
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/**
 * An account's shows and practices as an iCalendar feed (docs/band-plan.md,
 * "Pages"): `/cal/<token>.ics`, which a phone or a shared calendar
 * subscribes to. The token is the secret (a member copies the address from
 * the dashboard), so no sign-in; a token nobody made is a 404. Every event,
 * past and future, so the calendar keeps the history. Kept out of search
 * and out of shared caches; a calendar app polls, so five minutes of
 * private cache is plenty.
 */
export const GET: RequestHandler = async ({ params, url }) => {
	const acct = await accountByCalendarToken(params.token);
	if (!acct) error(404, "This calendar link is not one Stem Shovel made.");
	const body = icsCalendar(acct.name, await calendarEvents(acct.id), url.origin);
	return new Response(body, {
		headers: {
			"content-type": "text/calendar; charset=utf-8",
			"content-disposition": `inline; filename="${acct.slug}.ics"`,
			"cache-control": "private, max-age=300",
			"x-robots-tag": "noindex",
		},
	});
};
