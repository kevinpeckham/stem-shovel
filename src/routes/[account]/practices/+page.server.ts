import { listEvents, venueChoices } from "#lib/server/data.js";
import { memberPageAccount } from "#lib/server/memberPageAccount.js";
import type { PageServerLoad } from "./$types";

/**
 * The account's practices (docs/band-plan.md, "Event"): members only, as the set
 * lists. `?venue=<id>` keeps only those at one venue; the account's venues
 * feed that filter and the New practice popover's picker.
 */
export const load: PageServerLoad = async (event) => {
	const account = await memberPageAccount(event);
	const venueId = event.url.searchParams.get("venue") ?? "";
	const [events, choices] = await Promise.all([
		listEvents(account.id, "practice", { venueId: venueId || undefined }),
		venueChoices(account.id),
	]);
	return { events, venueId, venueChoices: choices };
};
