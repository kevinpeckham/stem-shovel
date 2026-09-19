import { getSong, listShareLinks, songWantsNotes } from "$lib/server/data";
import { mixKeyOf } from "$lib/server/mix";
import { aiAvailable } from "$lib/server/aiDetect";
import { scheduleNotes } from "$lib/server/jobs";
import { songView } from "$lib/server/songView";
import { canViewSong } from "$lib/server/viewAccess";
import { error } from "@sveltejs/kit";
import type { Config } from "@sveltejs/adapter-vercel";
import type { PageServerLoad } from "./$types";

/** Missing renditions render after the response, inside this function's lifetime. */
export const config: Config = { maxDuration: 300 };

export const load: PageServerLoad = async ({ params, parent }) => {
	const { account, canEdit, shareGrants } = await parent();
	const song = await getSong(account.id, params.project, params.song);
	if (!song) error(404, `No song "${params.song}" in "${params.project}"`);
	if (!canViewSong(song, canEdit, shareGrants)) {
		error(403, "This song is private. Sign in as a member, or open the link you were given.");
	}
	// The chart draft's notes are made after a stem upload; a member's visit only
	// posts the job when they are missing, behind the stems or stuck (a resume, a recovery).
	const noAi = song.noAi || song.project.noAi;
	if (canEdit && songWantsNotes(song, mixKeyOf)) scheduleNotes([song.id]);
	// song (file URLs the browser may fetch), manifest, comments, docs — shared with the home demo.
	const [view, shareLinks] = await Promise.all([
		songView(song),
		canEdit ? listShareLinks({ songId: song.id }) : [],
	]);
	return {
		...view,
		shareLinks,
		aiAvailable: canEdit && !noAi && aiAvailable(),
		noAi,
	};
};
