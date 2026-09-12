import { canEdit, publicAccountBySlug } from "$lib/server/access";
import type { LayoutServerLoad } from "./$types";

/**
 * Everything under /[account] is viewable by anyone with the URL; `canEdit`
 * says whether the current user is a member and so sees the controls. The
 * mutations behind those controls check membership themselves.
 */
export const load: LayoutServerLoad = async ({ params, locals }) => {
	const account = await publicAccountBySlug(params.account);
	return { account, canEdit: canEdit(locals, account.id) };
};
