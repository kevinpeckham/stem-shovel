import { requireMember, requireSignedIn } from "#lib/server/access.js";
import { listSetLists } from "#lib/server/data.js";
import type { PageServerLoad } from "./$types";

/** The account's set lists (docs/band-plan.md, "Set list"), last changed first: members only, as the Sessions page. */
export const load: PageServerLoad = async ({ parent, locals, url }) => {
	requireSignedIn(locals, url);
	const { account } = await parent();
	requireMember(locals, account.id);
	return { setLists: await listSetLists(account.id) };
};
