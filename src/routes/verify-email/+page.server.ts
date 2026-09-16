import { CURRENT_ACCOUNT_COOKIE, pickAccount } from "$lib/server/currentAccount";
import type { PageServerLoad } from "./$types";

/** Landing page for verification links; the session (if any) is already in locals. */
export const load: PageServerLoad = ({ locals, cookies }) => {
	const m = pickAccount(locals.memberships, cookies.get(CURRENT_ACCOUNT_COOKIE));
	return { user: locals.user, home: m ? `/${m.slug}/projects` : "/" };
};
