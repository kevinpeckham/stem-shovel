import { CURRENT_ACCOUNT_COOKIE, pickAccount } from "#lib/server/currentAccount.js";
import { realMemberships } from "#lib/utils/actingMemberships.js";
import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/** The account-neutral address (the page copy editor's way back, docs/page-copy.md): the user's current account's sessions. */
export const load: PageServerLoad = ({ locals, cookies }) => {
	const m = pickAccount(realMemberships(locals.memberships), cookies.get(CURRENT_ACCOUNT_COOKIE));
	if (!m) redirect(303, "/sign-in?next=%2Fsessions");
	redirect(307, `/${m.slug}/sessions`);
};
