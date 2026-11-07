import { listContacts } from "#lib/server/data.js";
import { memberPageAccount } from "#lib/server/memberPageAccount.js";
import type { PageServerLoad } from "./$types";

/** The account's contacts (promoters, agents, engineers; local to the account): members only. */
export const load: PageServerLoad = async (event) => {
	const account = await memberPageAccount(event);
	return { contacts: await listContacts(account.id) };
};
