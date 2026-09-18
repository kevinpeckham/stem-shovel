import { indexableStage } from "$lib/constants/securityHeaders";
import { CURRENT_ACCOUNT_COOKIE, pickAccount } from "$lib/server/currentAccount";
import { ENV } from "varlock/env";
import { realMemberships } from "$lib/utils/actingMemberships";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = ({ locals, cookies }) => ({
	/** Production only: staging and previews tell search engines to stay away everywhere. */
	indexable: indexableStage(ENV.VERCEL_ENV),
	user: locals.user,
	memberships: locals.memberships,
	/** The account neutral pages treat as the user's own (src/lib/server/currentAccount.ts). */
	currentSlug:
		pickAccount(realMemberships(locals.memberships), cookies.get(CURRENT_ACCOUNT_COOKIE))?.slug ??
		null,
});
