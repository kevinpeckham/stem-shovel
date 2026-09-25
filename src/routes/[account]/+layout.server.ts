import { canEdit, isMember, publicAccountBySlug, viewerOf } from "$lib/server/access";
import { openShareLinks, projectRolesOf, useShareLink } from "$lib/server/data";
import { rememberAccount } from "$lib/server/currentAccount";
import { rememberShareCodes, SHARE_COOKIE, shareCodesFrom } from "$lib/server/viewAccess";
import { error } from "@sveltejs/kit";
import type { LayoutServerLoad } from "./$types";

/**
 * Everything under /[account] is viewable by anyone with the URL unless a
 * project or song is private; `canEdit` says whether the current user is a
 * member and so sees the controls (the mutations behind them check
 * membership themselves). A visitor arriving with `?share=<code>` has the
 * code checked and remembered in a cookie; `shareGrants` are the open codes
 * they carry, which the project and song loaders test against
 * (src/lib/server/viewAccess.ts).
 */
export const load: LayoutServerLoad = async ({ params, locals, url, cookies }) => {
	// The account and the visitor's share codes are independent lookups: together.
	const [account, grants] = await Promise.all([
		publicAccountBySlug(params.account),
		openShareLinks(shareCodesFrom(url, cookies)),
	]);
	if (account.status !== "active") {
		error(403, "This account is suspended. Its pages are closed until it is reactivated.");
	}
	const arriving = url.searchParams.get("share")?.trim();
	if (arriving && grants.some((g) => g.code === arriving)) {
		const remembered = (cookies.get(SHARE_COOKIE) ?? "").split(",").filter(Boolean);
		if (!remembered.includes(arriving)) {
			await useShareLink(arriving);
			rememberShareCodes(cookies, [arriving, ...remembered]);
		}
	}
	const member = canEdit(locals, account.id);
	if (member) rememberAccount(cookies, account.slug); // "your" account, for the neutral pages
	// The person as the view rules see them: account role plus the projects they were added to
	// (a project viewer from outside the account, a member added to a restricted project).
	const who = viewerOf(
		locals,
		account.id,
		locals.user ? await projectRolesOf(account.id, locals.user.id) : {},
	);
	return {
		account,
		/** May change things in the account; a project page narrows this to the project (src/lib/server/viewAccess.ts). */
		canEdit: member,
		canComment: isMember(locals, account.id),
		who,
		shareGrants: grants,
	};
};
