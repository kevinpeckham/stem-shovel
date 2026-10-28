import { listVenues } from "#lib/server/data.js";
import { memberPageAccount } from "#lib/server/memberPageAccount.js";
import type { PageServerLoad } from "./$types";

/** The account's venues (the ones it has used or added; venues themselves are shared by every band): members only, as the shows. */
export const load: PageServerLoad = async (event) => {
	const account = await memberPageAccount(event);
	return { venues: await listVenues(account.id) };
};
