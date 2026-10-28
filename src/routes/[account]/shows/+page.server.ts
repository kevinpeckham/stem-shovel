import { listEvents } from "#lib/server/data.js";
import { memberPageAccount } from "#lib/server/memberPageAccount.js";
import type { PageServerLoad } from "./$types";

/** The account's shows (docs/band-plan.md, "Event"): members only, as the set lists. */
export const load: PageServerLoad = async (event) => {
	const account = await memberPageAccount(event);
	return { events: await listEvents(account.id, "show") };
};
