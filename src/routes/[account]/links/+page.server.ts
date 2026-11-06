import { requireMember, requireSignedIn } from "#lib/server/access.js";
import { listAccountShareLinks } from "#lib/server/data.js";
import type { PageServerLoad } from "./$types";

/**
 * Every viewing link the account has handed out (share_link): members only,
 * a viewer too, since a viewer can open everything the links open and the
 * codes are the account's own. Editing (Revoke) is gated on the layout's
 * `canEdit`, and the remote function checks it again.
 */
export const load: PageServerLoad = async ({ parent, locals, url }) => {
	requireSignedIn(locals, url);
	const { account } = await parent();
	requireMember(locals, account.id);
	return { links: await listAccountShareLinks(account.id, account.slug) };
};
