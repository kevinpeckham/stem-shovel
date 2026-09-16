import { CURRENT_ACCOUNT_COOKIE, pickAccount } from "$lib/server/currentAccount";
import { realMemberships } from "$lib/utils/actingMemberships";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = ({ locals, cookies }) => ({
	user: locals.user,
	memberships: locals.memberships,
	/** The account neutral pages treat as the user's own (src/lib/server/currentAccount.ts). */
	currentSlug:
		pickAccount(realMemberships(locals.memberships), cookies.get(CURRENT_ACCOUNT_COOKIE))?.slug ??
		null,
});
