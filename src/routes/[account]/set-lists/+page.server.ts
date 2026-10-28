import { listSetLists } from "#lib/server/data.js";
import { memberPageAccount } from "#lib/server/memberPageAccount.js";
import type { PageServerLoad } from "./$types";

/** The account's set lists (docs/band-plan.md, "Set list"), last changed first: members only, as the Sessions page. */
export const load: PageServerLoad = async (event) => {
	const account = await memberPageAccount(event);
	return { setLists: await listSetLists(account.id) };
};
