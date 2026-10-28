import { listPracticeLocations } from "#lib/server/data.js";
import { memberPageAccount } from "#lib/server/memberPageAccount.js";
import type { PageServerLoad } from "./$types";

/** The account's practice locations (local to the account, unlike venues): members only, as the practices. */
export const load: PageServerLoad = async (event) => {
	const account = await memberPageAccount(event);
	return { locations: await listPracticeLocations(account.id) };
};
