import { CURRENT_ACCOUNT_COOKIE, pickAccount } from "$lib/server/currentAccount";
import { realMemberships } from "$lib/utils/actingMemberships";
import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/** Old address; go to the user's current account. */
export const load: PageServerLoad = ({ locals, cookies }) => {
	const m = pickAccount(realMemberships(locals.memberships), cookies.get(CURRENT_ACCOUNT_COOKIE));
	if (!m) redirect(303, "/sign-in");
	redirect(307, `/${m.slug}/settings`);
};
