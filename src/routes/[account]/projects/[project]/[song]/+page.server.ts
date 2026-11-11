import {
	getSong,
	getUserNote,
	listAmpPresets,
	listArtists,
	listSessionRecordingsOfSong,
	listShareLinks,
	siteAmpPresets,
	songChat,
	stemStreaming,
} from "#lib/server/data.js";
import { songWantsChords } from "#lib/utils/songWantsChords.js";
import { songWantsNotes } from "#lib/utils/songWantsNotes.js";
import { linkMentions } from "#lib/utils/linkMentions.js";
import { mentionTargets } from "#lib/utils/mentionTargets.js";
import { mixKeyOf } from "#lib/server/mix.js";
import { aiAvailable } from "#lib/server/aiDetect.js";
import { scheduleChords, scheduleNotationPdf, scheduleNotes } from "#lib/server/jobs.js";
import { songView } from "#lib/server/songView.js";
import { canCommentProject, canEditProject, canViewSong } from "#lib/server/viewAccess.js";
import { renamedProjectPath } from "#lib/server/slugAlias.js";
import { error, redirect } from "@sveltejs/kit";
import type { Config } from "@sveltejs/adapter-vercel";
import type { PageServerLoad } from "./$types";

/** Missing renditions render after the response, inside this function's lifetime. */
export const config: Config = { maxDuration: 300 };

/**
 * The background jobs a song is missing, posted by a member's visit as a
 * backstop: the chart draft's notes are made after a stem upload, and the
 * chord model reads the mix after it renders, so a visit posts either only
 * when it is missing, behind the stems or the mix, or stuck (a resume, a
 * recovery).
 */
function scheduleBackstops(
	song: { id: string; arrangementId: string | null } & Parameters<typeof songWantsNotes>[0] &
		Parameters<typeof songWantsChords>[0],
) {
	// The notes and chord reads are Main's (docs/arrangements.md, phase 3): an alternate's stems would never match their keys.
	if (song.arrangementId !== null) return;
	if (songWantsNotes(song, mixKeyOf)) scheduleNotes([song.id]);
	if (songWantsChords(song)) scheduleChords([song.id]);
}

/** `?arrangement=<id>` plays one of the song's alternates (docs/arrangements.md); null, Main, without it. */
const arrangementOf = (url: URL) => url.searchParams.get("arrangement") || null;

/**
 * An arrangement the song does not have (deleted, or another song's) goes to
 * the same address on Main; asked once the visitor may see the song.
 */
function onMainUnlessServed(url: URL, served: string | null) {
	const asked = arrangementOf(url);
	if (!asked || asked === served) return;
	const main = new URL(url);
	main.searchParams.delete("arrangement");
	redirect(307, `${main.pathname}${main.search}${main.hash}`);
}

export const load: PageServerLoad = async ({ params, parent, url, locals }) => {
	const { account, who, shareGrants } = await parent();
	const song = await getSong(account.id, params.project, params.song, arrangementOf(url));
	if (!song) {
		// An address the project or the song used to have redirects to the current one (src/lib/server/slugAlias.ts).
		const to = await renamedProjectPath(url, account.id, params.project, params.song);
		if (to) redirect(308, to);
		error(404, `No song "${params.song}" in "${params.project}"`);
	}
	if (!canViewSong(song, who, shareGrants)) {
		error(403, "This song is private. Sign in as a member, or open the link you were given.");
	}
	onMainUnlessServed(url, song.arrangementId);
	// The project's own answer (a restricted project narrows the account's).
	const canEdit = canEditProject(song.project, who);
	const noAi = song.noAi || song.project.noAi;
	if (canEdit) scheduleBackstops(song);
	// A score uploaded before the PDFs existed (or whose render was lost): its PDF is rendered on the next visit.
	for (const score of song.notation) {
		if (score.status === "ready" && score.pdfStatus === null) scheduleNotationPdf(score.id);
	}
	// song (file URLs the browser may fetch), manifest, comments, docs — shared with the home demo.
	const canComment = canCommentProject(song.project, who);
	const userId = locals.user?.id ?? null;
	const [view, shareLinks, artists, myNote, chat, sessionRecordings] = await Promise.all([
		songView(song),
		canEdit ? listShareLinks({ songId: song.id }) : [],
		canEdit ? listArtists(account.id) : [],
		userId ? getUserNote(song.id, userId) : null,
		// The chat (docs/chat.md) is the project's own: loaded for someone who may write in it, never for a visitor.
		songChat(song.id, canComment ? userId : null),
		// The session recordings the band tied to this song (docs/uploads-and-blob.md, "Sessions"); members only, as the Sessions page.
		canEdit || canComment ? listSessionRecordingsOfSong(account.id, song.id) : [],
	]);
	// `@Chart` in a document links to the attachment, notation file or demo of that name (docs/uploads-and-blob.md, "Mentions").
	const targets = mentionTargets(song);
	const docs = {
		chart: linkMentions(view.docs.chart, targets),
		lyrics: linkMentions(view.docs.lyrics, targets),
		notes: linkMentions(view.docs.notes, targets),
	};
	// The Practice Amp's presets (docs/practice-amp.md, "Presets") for the play-along panel: the site's, and the account's for an editor.
	const [ampGuitar, ampBass, ampPresets] = await Promise.all([
		siteAmpPresets("guitar"),
		siteAmpPresets("bass"),
		canEdit ? listAmpPresets(account.id) : [],
	]);
	return {
		...view,
		docs,
		canEdit,
		canComment,
		ampSitePresets: { guitar: ampGuitar, bass: ampBass },
		ampPresets,
		ampAccount: canEdit ? { id: account.id, name: account.name, canEdit: true } : null,
		presetAdmin: locals.user?.isSystemAdmin === true,
		/** The song's chat and where this person last read it; null for anyone who may not write in it. */
		chat,
		shareLinks,
		/** Session recordings of this song, for the Demos view; empty for a visitor. */
		sessionRecordings,
		/** The account's artist directory, for the credits picker. */
		artists,
		aiAvailable: canEdit && !noAi && aiAvailable(),
		noAi,
		/** How the site streams stems (docs/stem-streaming.md); the player decides per device. */
		stemStreaming: await stemStreaming(),
		/** The signed-in person's private note on this song ("mynotes"); null signed out or before the first save. */
		myNote: myNote && { ...myNote, html: linkMentions(myNote.html, targets) },
	};
};
