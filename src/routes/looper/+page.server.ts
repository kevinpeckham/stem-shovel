import { publicBlobUrl } from "$lib/server/blob";
import { isEditor, requireSignedIn } from "$lib/server/access";
import { aiAvailable } from "$lib/server/aiDetect";
import { CURRENT_ACCOUNT_COOKIE, pickAccount } from "$lib/server/currentAccount";
import { listBeats, listPianoPresets, sitePianoPresets } from "$lib/server/data";
import { realMemberships } from "$lib/utils/actingMemberships";
import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/**
 * The looper (docs/looper.md), the user's own page like the Idea
 * Recorder: a saved loop becomes an idea's take with the layers as its
 * sources, filed under the current account (where its storage counts);
 * the drum machine's beats and the piano's presets in the panels are that
 * account's too.
 */
export const load: PageServerLoad = async ({ locals, cookies, url }) => {
	requireSignedIn(locals, url);
	const editing = realMemberships(locals.memberships).filter((m) => isEditor(m.role));
	const member = pickAccount(editing, cookies.get(CURRENT_ACCOUNT_COOKIE));
	if (!member) redirect(303, "/accounts");
	return {
		account: { id: member.accountId, name: member.name, slug: member.slug, canEdit: true },
		pianoSamplesBase: publicBlobUrl("piano/v1"),
		beats: await listBeats(member.accountId),
		textToBeat: aiAvailable(),
		sitePresets: await sitePianoPresets(),
		pianoPresets: await listPianoPresets(member.accountId),
		presetAdmin: locals.user?.isSystemAdmin === true,
	};
};
