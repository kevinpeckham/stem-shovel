import { getSong, getUserNote, listArtists, listShareLinks } from "#lib/server/data.js";
import { songWantsNotes } from "#lib/utils/songWantsNotes.js";
import { linkMentions } from "#lib/utils/linkMentions.js";
import { mentionTargets } from "#lib/utils/mentionTargets.js";
import { mixKeyOf } from "#lib/server/mix.js";
import { aiAvailable } from "#lib/server/aiDetect.js";
import { scheduleNotationPdf, scheduleNotes } from "#lib/server/jobs.js";
import { songView } from "#lib/server/songView.js";
import { canCommentProject, canEditProject, canViewSong } from "#lib/server/viewAccess.js";
import { renamedProjectPath } from "#lib/server/slugAlias.js";
import { error, redirect } from "@sveltejs/kit";
import type { Config } from "@sveltejs/adapter-vercel";
import type { PageServerLoad } from "./$types";

/** Missing renditions render after the response, inside this function's lifetime. */
export const config: Config = { maxDuration: 300 };

export const load: PageServerLoad = async ({ params, parent, url, locals }) => {
	const { account, who, shareGrants } = await parent();
	const song = await getSong(account.id, params.project, params.song);
	if (!song) {
		// An address the project or the song used to have redirects to the current one (src/lib/server/slugAlias.ts).
		const to = await renamedProjectPath(url, account.id, params.project, params.song);
		if (to) redirect(308, to);
		error(404, `No song "${params.song}" in "${params.project}"`);
	}
	if (!canViewSong(song, who, shareGrants)) {
		error(403, "This song is private. Sign in as a member, or open the link you were given.");
	}
	// The project's own answer (a restricted project narrows the account's).
	const canEdit = canEditProject(song.project, who);
	// The chart draft's notes are made after a stem upload; a member's visit only
	// posts the job when they are missing, behind the stems or stuck (a resume, a recovery).
	const noAi = song.noAi || song.project.noAi;
	if (canEdit && songWantsNotes(song, mixKeyOf)) scheduleNotes([song.id]);
	// A score uploaded before the PDFs existed (or whose render was lost): its PDF is rendered on the next visit.
	for (const score of song.notation) {
		if (score.status === "ready" && score.pdfStatus === null) scheduleNotationPdf(score.id);
	}
	// song (file URLs the browser may fetch), manifest, comments, docs — shared with the home demo.
	const [view, shareLinks, artists, myNote] = await Promise.all([
		songView(song),
		canEdit ? listShareLinks({ songId: song.id }) : [],
		canEdit ? listArtists(account.id) : [],
		locals.user ? getUserNote(song.id, locals.user.id) : null,
	]);
	// `@Chart` in a document links to the attachment, notation file or demo of that name (docs/uploads-and-blob.md, "Mentions").
	const targets = mentionTargets(song);
	const docs = {
		chart: linkMentions(view.docs.chart, targets),
		lyrics: linkMentions(view.docs.lyrics, targets),
		notes: linkMentions(view.docs.notes, targets),
	};
	return {
		...view,
		docs,
		canEdit,
		canComment: canCommentProject(song.project, who),
		shareLinks,
		/** The account's artist directory, for the credits picker. */
		artists,
		aiAvailable: canEdit && !noAi && aiAvailable(),
		noAi,
		/** The signed-in person's private note on this song ("mynotes"); null signed out or before the first save. */
		myNote: myNote && { ...myNote, html: linkMentions(myNote.html, targets) },
	};
};
