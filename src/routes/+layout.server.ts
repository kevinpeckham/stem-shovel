import { indexableStage } from "$lib/constants/securityHeaders";
import { CURRENT_ACCOUNT_COOKIE, pickAccount } from "$lib/server/currentAccount";
import { ENV } from "varlock/env";
import { realMemberships } from "$lib/utils/actingMemberships";
import { signUpMode } from "$lib/server/data";
import { unreadCount } from "$lib/server/notifications";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals, cookies }) => ({
	/** Anyone may create an account; false means invite-only and the pages show the waitlist (docs/auth.md). */
	signUpOpen: (await signUpMode()) === "open",
	/** Production only: staging and previews tell search engines to stay away everywhere. */
	indexable: indexableStage(ENV.VERCEL_ENV),
	/** development | preview | production: the tab title carries a DEV or STAGE tag off production (src/lib/utils/pageTitle.ts). */
	stage: ENV.APP_ENV,
	user: locals.user,
	memberships: locals.memberships,
	/** Unread inbox items, for the badge on the account menu. */
	unread: locals.user ? await unreadCount(locals.user.id) : 0,
	/** The account neutral pages treat as the user's own (src/lib/server/currentAccount.ts). */
	currentSlug:
		pickAccount(realMemberships(locals.memberships), cookies.get(CURRENT_ACCOUNT_COOKIE))?.slug ??
		null,
});
