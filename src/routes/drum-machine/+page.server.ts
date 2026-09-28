import { aiAvailable } from "$lib/server/aiDetect";
import { CURRENT_ACCOUNT_COOKIE, pickAccount } from "$lib/server/currentAccount";
import { listBeats, songForBeat } from "$lib/server/data";
import { realMemberships } from "$lib/utils/actingMemberships";
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
		beats: member ? await listBeats(member.accountId) : [],
		song: member && songId ? await songForBeat(member.accountId, songId) : null,
		// Text-to-Beat needs the AI Gateway (docs/drum-machine.md).
		textToBeat: aiAvailable(),
	};
};
