import { canViewSession } from "#lib/server/viewAccess.js";
import { listShareLinks, recordingSessionPage } from "#lib/server/data.js";
import { presentUrl } from "#lib/server/blob.js";
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/**
 * A whole session's own page (docs/uploads-and-blob.md, "Sessions"): every
 * ready recording of one practice or show, where the session's share link
 * lands. A member of the account sees it as on the Sessions page; a
 * visitor holding the session's link hears and downloads every recording
 * of it, nothing else of the account. Anyone else gets a 404, never a 403
 * (a public recording alone does not open its session).
 */
export const load: PageServerLoad = async ({ parent, params }) => {
	const { account, who, shareGrants, canEdit } = await parent();
	const found = await recordingSessionPage(account.id, params.session);
	if (!found || !canViewSession(found.session, who, shareGrants)) error(404, "Not found");
	const [recordings, shareLinks] = await Promise.all([
		Promise.all(
			found.recordings.map(async (r) => {
				const [url, playbackUrl] = await Promise.all([
					presentUrl(r.url),
					presentUrl(r.playbackUrl),
				]);
				return { ...r, url: url ?? r.url, playbackUrl };
			}),
		),
		canEdit ? listShareLinks({ sessionId: found.session.id }) : [],
	]);
	return {
		session: found.session,
		recordings,
		/** A member: may hand the link on. */
		member: who.accountRole !== null,
		shareLinks,
	};
};
