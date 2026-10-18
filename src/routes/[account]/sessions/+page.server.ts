import { requireMember, requireSignedIn } from "#lib/server/access.js";
import { listSessionRecordings } from "#lib/server/data.js";
import type { PageServerLoad } from "./$types";

/** The account's session recordings (practice and shows): members only, since they are the band's own tapes. */
export const load: PageServerLoad = async ({ parent, locals, url }) => {
	requireSignedIn(locals, url);
	const { account } = await parent();
	requireMember(locals, account.id);
	return { sessions: await listSessionRecordings(account.id) };
};
