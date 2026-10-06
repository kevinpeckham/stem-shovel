import { isEditor, requireSignedIn } from "$lib/server/access";
import { CURRENT_ACCOUNT_COOKIE, pickAccount } from "$lib/server/currentAccount";
import { listStudioSongs } from "$lib/server/data";
import { pageCopy } from "$lib/server/pageCopy";
import { songTargets } from "$lib/server/songTargets";
import { realMemberships } from "$lib/utils/actingMemberships";
import { redirect } from "@sveltejs/kit";
import copyFallback from "../../../scripts/user-docs/studio-page.md?raw";
import type { PageServerLoad } from "./$types";

/**
 * Stands in for scripts/user-docs/studio-page.md until that file lands
 * (the seed makes the "studio-page" copy doc from it; docs/page-copy.md).
 * as the recorder's load does once it exists.
 */

/**
 * The Studio (docs/multitrack-recorder.md), the user's own page like the
 * Idea Recorder: songs are ideas of kind "song" and belong to the user,
 * whichever account they were recorded in. New sources are filed under the
 * current account (src/lib/server/currentAccount.ts), where their storage
 * counts; a bounce can go to a song in any account the user edits. Sources
 * come along as metadata (a URL to fetch on demand, never the audio).
 */
export const load: PageServerLoad = async ({ locals, cookies, url }) => {
	const user = requireSignedIn(locals, url);
	const editing = realMemberships(locals.memberships).filter((m) => isEditor(m.role));
	const member = pickAccount(editing, cookies.get(CURRENT_ACCOUNT_COOKIE));
	// Recording needs an account to hold the files (storage is the account's): a user without one is sent to make or join one.
	if (!member) redirect(303, "/accounts");
	return {
		account: { id: member.accountId, slug: member.slug, name: member.name },
		songs: await listStudioSongs(user.id),
		projects: await songTargets(editing),
		// The page's words (title, intro, the tips under the device) from its copy doc, edited in the app (docs/page-copy.md).
		copy: await pageCopy("studio-page", copyFallback, locals),
	};
};
