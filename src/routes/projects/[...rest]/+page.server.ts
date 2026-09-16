import { CURRENT_ACCOUNT_COOKIE, pickAccount } from "$lib/server/currentAccount";
import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/** Old deep links (/projects/x/y) go to the same path under the user's current account. */
export const load: PageServerLoad = ({ locals, params, cookies }) => {
	const m = pickAccount(locals.memberships, cookies.get(CURRENT_ACCOUNT_COOKIE));
	if (!m) redirect(303, "/sign-in");
	redirect(307, `/${m.slug}/projects/${params.rest}`);
};
