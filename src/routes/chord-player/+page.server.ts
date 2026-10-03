import { publicBlobUrl } from "$lib/server/blob";
import { CURRENT_ACCOUNT_COOKIE, pickAccount } from "$lib/server/currentAccount";
import {
	listChordStyles,
	listPianoPresets,
	listProgressions,
	sitePianoPresets,
} from "$lib/server/data";
import { pageCopy } from "$lib/server/pageCopy";
import { realMemberships } from "$lib/utils/actingMemberships";
import copyFallback from "../../../scripts/user-docs/chord-player-page.md?raw";
import type { PageServerLoad } from "./$types";

/**
 * The chord player page (docs/chord-player.md): the piano's sounds on the
 * circle of fifths, so it loads what the piano page loads: where the
 * Grand Piano's sample tiers live, the site's presets and, for a signed-in
 * member, their account's. Open to everyone.
 */
export const load: PageServerLoad = async ({ locals, cookies }) => {
	const member = locals.user
		? pickAccount(realMemberships(locals.memberships), cookies.get(CURRENT_ACCOUNT_COOKIE))
		: null;
	return {
		samplesBase: publicBlobUrl("piano/v1"),
		sitePresets: await sitePianoPresets(),
		account: member
			? { id: member.accountId, name: member.name, canEdit: member.role !== "viewer" }
			: null,
		presets: member ? await listPianoPresets(member.accountId) : [],
		progressions: member ? await listProgressions(member.accountId) : [],
		chordStyles: member ? await listChordStyles(member.accountId) : [],
		// The page's words (title, intro, the tips under the device) from its copy doc, edited in the app (docs/page-copy.md).
		copy: await pageCopy("chord-player-page", copyFallback, locals),
	};
};
