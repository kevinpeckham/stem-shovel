import { requireMember, requireSignedIn } from "#lib/server/access.js";
import { accountSongChoices, listShareLinks, setListPage } from "#lib/server/data.js";
import { canViewSong } from "#lib/server/viewAccess.js";
import { error, redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/**
 * A set list's editor (docs/band-plan.md, "Set list"): members only. Its
 * rows (a song the person may not open reads as plain text), the songs to
 * add, and its viewing links. A viewer of the account, who may not change
 * it, lands on the show view instead.
 */
export const load: PageServerLoad = async ({ parent, params, locals, url }) => {
	const { account, who, canEdit } = await parent();
	const found = await setListPage(account.id, params.id);
	if (!found) error(404, "Not found");
	requireSignedIn(locals, url);
	requireMember(locals, account.id);
	if (!canEdit) redirect(303, `/${account.slug}/set-lists/${found.setList.id}/show`);
	const [choices, shareLinks] = await Promise.all([
		accountSongChoices(account.id),
		listShareLinks({ setListId: found.setList.id }),
	]);
	return {
		setList: found.setList,
		items: found.items.map((r) =>
			r.song && !canViewSong(r.song, who, []) ? { ...r, song: null } : r,
		),
		choices: choices.filter((s) => canViewSong(s, who, [])),
		shareLinks,
	};
};
