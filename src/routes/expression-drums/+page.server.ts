import { aiAvailable } from "#lib/server/aiDetect.js";
import { CURRENT_ACCOUNT_COOKIE, pickAccount } from "#lib/server/currentAccount.js";
import { listExpressionBeats, listMultisampledKitManifests, songForBeat } from "#lib/server/data.js";
import { pageCopy } from "#lib/server/pageCopy.js";
import { realMemberships } from "#lib/utils/actingMemberships.js";
import copyFallback from "../../../scripts/user-docs/expression-drums-page.md?raw";
import type { PageServerLoad } from "./$types";

/**
 * The drum machine works without an account; a signed-in member also gets
 * their account's saved beats (docs/drum-machine.md, Phase 3), the account
 * being the one neutral pages treat as theirs (src/lib/server/currentAccount.ts).
 * `?song=<id>` (the song page's Uploads menu) names a song of that account
 * the beat is for: the page seeds a new beat at the song's tempo and meter,
 * Save attaches it, and the ⋯ menu can add it to the song as a demo.
 */
export const load: PageServerLoad = async ({ locals, cookies, url }) => {
	const member = locals.user
		? pickAccount(realMemberships(locals.memberships), cookies.get(CURRENT_ACCOUNT_COOKIE))
		: null;
	const songId = url.searchParams.get("song");
	return {
		account: member
			? { id: member.accountId, name: member.name, canEdit: member.role !== "viewer" }
			: null,
		// The account's beats, the drum machine's converted to this format (velocities 1, 2, 3 as 1, 3, 5).
		beats: member ? await listExpressionBeats(member.accountId) : [],
		// The custom kits the machine may play, every layer and round robin: the site's, and the account's (docs/drum-machine.md, "Multisampled kits").
		kits: await listMultisampledKitManifests(member?.accountId ?? null),
		song: member && songId ? await songForBeat(member.accountId, songId) : null,
		// Text-to-Beat needs the AI Gateway (docs/drum-machine.md).
		textToBeat: aiAvailable(),
		// A system admin can make the beat here the home page's starting one (the ⋯ menu), as on the home page itself.
		homeAdmin: locals.user?.isSystemAdmin === true,
		// The page's words (title, intro, the tips under the device) from its copy doc, edited in the app (docs/page-copy.md).
		copy: await pageCopy("expression-drums-page", copyFallback, locals),
	};
};
