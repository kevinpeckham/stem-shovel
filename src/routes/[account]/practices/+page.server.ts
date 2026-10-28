import { listEvents, practiceLocationChoices } from "#lib/server/data.js";
import { memberPageAccount } from "#lib/server/memberPageAccount.js";
import type { PageServerLoad } from "./$types";

/**
 * The account's practices (docs/band-plan.md, "Event"): members only, as the set
 * lists. `?location=<id>` keeps only those at one practice location; the
 * account's locations feed that filter and the New practice popover's picker.
 */
export const load: PageServerLoad = async (event) => {
	const account = await memberPageAccount(event);
	const locationId = event.url.searchParams.get("location") ?? "";
	const [events, choices] = await Promise.all([
		listEvents(account.id, "practice", { locationId: locationId || undefined }),
		practiceLocationChoices(account.id),
	]);
	return { events, locationId, locationChoices: choices };
};
