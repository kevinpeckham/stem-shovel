import { publicBlobUrl } from "$lib/server/blob";
import { CURRENT_ACCOUNT_COOKIE, pickAccount } from "$lib/server/currentAccount";
import { listPianoPresets, sitePianoPresets } from "$lib/server/data";
import { pageCopy } from "$lib/server/pageCopy";
import { realMemberships } from "$lib/utils/actingMemberships";
import copyFallback from "../../../scripts/user-docs/piano-page.md?raw";
import type { PageServerLoad } from "./$types";

/**
 * The piano page: where this stage keeps the Grand Piano's standard and
 * hi-res sample tiers (scripts/piano-samples.ts), the site's demo presets,
 * and for a signed-in member their account's presets (docs/piano.md,
 * "Presets"), the account being the one neutral pages treat as theirs
 * (src/lib/server/currentAccount.ts).
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
		presetAdmin: locals.user?.isSystemAdmin === true,
		// The page's words (title, intro, "How to Play" under the piano) from its copy doc, edited in the app (docs/page-copy.md).
		copy: await pageCopy("piano-page", copyFallback, locals),
	};
};
