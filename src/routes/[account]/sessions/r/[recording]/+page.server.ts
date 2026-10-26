import { canViewRecording } from "#lib/server/viewAccess.js";
import { listShareLinks, sessionRecordingPage } from "#lib/server/data.js";
import { presentUrl } from "#lib/server/blob.js";
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/**
 * One session recording's own page (docs/uploads-and-blob.md, "Sessions"):
 * where a share link lands. A member of the account sees it as on the
 * Sessions page; a visitor holding the recording's link hears it and
 * downloads it, nothing else of the account, and so does anyone when a
 * member made it public. Anyone else gets a 404, never a 403.
 */
export const load: PageServerLoad = async ({ parent, params }) => {
	const { account, who, shareGrants, canEdit } = await parent();
	const recording = await sessionRecordingPage(account.id, params.recording);
	if (!recording || !canViewRecording(recording, who, shareGrants)) error(404, "Not found");
	const [url, playbackUrl, shareLinks] = await Promise.all([
		presentUrl(recording.url),
		presentUrl(recording.playbackUrl),
		canEdit ? listShareLinks({ recordingId: recording.id }) : [],
	]);
	return {
		recording: { ...recording, url: url ?? recording.url, playbackUrl },
		/** A member: may hand the link on. */
		member: who.accountRole !== null,
		shareLinks,
	};
};
