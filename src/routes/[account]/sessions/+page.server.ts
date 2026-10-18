import { requireMember, requireSignedIn } from "#lib/server/access.js";
import { listRecordingSessions } from "#lib/server/data.js";
import type { PageServerLoad } from "./$types";

/** The account's sessions (practices and shows) with their recordings: members only, since they are the band's own tapes. */
export const load: PageServerLoad = async ({ parent, locals, url }) => {
	requireSignedIn(locals, url);
	const { account } = await parent();
	requireMember(locals, account.id);
	return { sessions: await listRecordingSessions(account.id) };
};
