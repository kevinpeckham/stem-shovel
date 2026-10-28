import { findPracticeLocation, listEvents } from "#lib/server/data.js";
import { memberPageAccount } from "#lib/server/memberPageAccount.js";
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/**
 * A practice location of the account: its name, address and notes, and the
 * practices there. Members only; another account's location is a 404.
 */
export const load: PageServerLoad = async (event) => {
	const account = await memberPageAccount(event);
	const location = await findPracticeLocation(account.id, event.params.id);
	if (!location) error(404, "Not found");
	const events = await listEvents(account.id, "practice", { locationId: location.id });
	return { location, events };
};
