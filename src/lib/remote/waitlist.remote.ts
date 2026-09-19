import { form, getRequestEvent } from "$app/server";
import { background } from "$lib/server/background";
import { joinWaitlist, setWaitlistPrefs } from "$lib/server/data";
import { sendWaitlistConfirmEmail } from "$lib/server/email";
import { HOUR, rateLimited } from "$lib/server/rateLimit";
import { waitlistManageUrl } from "$lib/utils/waitlistManageUrl";
import { WaitlistJoinSchema, WaitlistPrefsSchema } from "$lib/val/WaitlistSchema";
import { error } from "@sveltejs/kit";

/**
 * Anyone joins the beta waitlist (the front page, /waitlist). The address is
 * only kept as confirmed once the emailed link is opened; consent to project
 * updates is a separate, off-by-default box. Bots hit the honeypot and the
 * rate limit; an address that is already confirmed is told so without a
 * second email.
 */
export const join = form(WaitlistJoinSchema, async ({ email, name, updates }) => {
	const { url, getClientAddress } = getRequestEvent();
	if (
		(await rateLimited(`waitlist:${getClientAddress()}`, 5, HOUR)) ||
		(await rateLimited(`waitlist:${email}`, 3, HOUR))
	)
		error(429, "That is a lot of sign-ups; try again in a while.");
	const { next, row } = await joinWaitlist({
		email,
		name,
		updatesOk: updates,
		source: url.pathname,
	});
	if (next === "confirm") {
		// The mail goes after the response; a failure is logged, and a retry is one more submit.
		background(() =>
			sendWaitlistConfirmEmail({
				to: row.email,
				name: row.name,
				confirmUrl: `${url.origin}/waitlist/confirm/${row.confirmToken}`,
				manageUrl: waitlistManageUrl(url.origin, row.manageToken),
				updatesOk: row.updatesOk,
			}),
		);
	}
	return { next };
});

/** From the manage page: project updates on or off, or leave the list. */
export const prefs = form(WaitlistPrefsSchema, async ({ token, action }) => {
	const row = await setWaitlistPrefs(token, action);
	if (!row) error(404, "That link is not valid any more");
	return { status: row.status, updatesOk: row.updatesOk };
});
