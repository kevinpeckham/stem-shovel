import { venuePage } from "#lib/server/data.js";
import { memberPageAccount } from "#lib/server/memberPageAccount.js";
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/**
 * A venue the account has linked: the shared facts, the account's own notes
 * and contact, and its shows and practices there. Members only; a venue
 * the account has not linked is a 404.
 */
export const load: PageServerLoad = async (event) => {
	const account = await memberPageAccount(event);
	const found = await venuePage(account.id, event.params.id);
	if (!found) error(404, "Not found");
	return found;
};
