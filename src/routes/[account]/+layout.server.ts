import { canEdit, publicAccountBySlug } from "$lib/server/access";
import { openShareLinks, useShareLink } from "$lib/server/data";
import { rememberAccount } from "$lib/server/currentAccount";
import { rememberShareCodes, shareCodesFrom } from "$lib/server/viewAccess";
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
	const account = await publicAccountBySlug(params.account);
	if (account.status !== "active") {
		error(403, "This account is suspended. Its pages are closed until it is reactivated.");
	}
	const carried = shareCodesFrom(url, cookies);
	const grants = await openShareLinks(carried);
	const arriving = url.searchParams.get("share")?.trim();
	if (arriving && grants.some((g) => g.code === arriving)) {
		const remembered = (cookies.get("share") ?? "").split(",").filter(Boolean);
		if (!remembered.includes(arriving)) {
			await useShareLink(arriving);
			rememberShareCodes(cookies, [arriving, ...remembered]);
		}
	}
	const member = canEdit(locals, account.id);
	if (member) rememberAccount(cookies, account.slug); // "your" account, for the neutral pages
	return { account, canEdit: member, shareGrants: grants };
};
