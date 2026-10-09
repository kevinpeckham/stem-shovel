import { presentUrl } from "#lib/server/blob.js";
import {
	getSong,
	listMixComments,
	listShareLinks,
	mixesWantingPlayback,
	songChat,
} from "#lib/server/data.js";
import { scheduleMixPlayback } from "#lib/server/jobs.js";
import { renderMarkdown } from "#lib/server/markdown.js";
import { canCommentProject, canEditProject, canViewSong } from "#lib/server/viewAccess.js";
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/**
 * A mix's own page (docs/mixes.md, "Phase 2"): the review surface a share
 * link or a notification lands on. Loads only what review needs: the
 * song's name and privacy, every ready mix with a URL the browser may
 * fetch and its notes rendered, the mixes' comments, the chat for someone
 * who may write in it, and the share links for an editor. Viewing follows
 * the song's rule (members, share links, public songs).
 */
export const load: PageServerLoad = async ({ params, parent, locals }) => {
	const { account, who, shareGrants } = await parent();
	const song = await getSong(account.id, params.project, params.song);
	if (!song) error(404, `No song "${params.song}" in "${params.project}"`);
	if (!canViewSong(song, who, shareGrants)) {
		error(403, "This song is private. Sign in as a member, or open the link you were given.");
	}
	const chosen = song.mixes.find((m) => m.id === params.mix && m.status === "ready" && m.url);
	if (!chosen) error(404, "No such mix of this song");
	scheduleMixPlayback(mixesWantingPlayback(song.mixes));
	const canEdit = canEditProject(song.project, who);
	const canComment = canCommentProject(song.project, who);
	const userId = locals.user?.id ?? null;
	const [mixes, mixComments, chat, shareLinks] = await Promise.all([
		Promise.all(
			song.mixes
				.filter((m) => m.status === "ready" && m.url)
				.map(async (m) => ({
					...m,
					url: (await presentUrl(m.url)) ?? m.url,
					playbackUrl: await presentUrl(m.playbackUrl),
					notesHtml: renderMarkdown(m.notes),
				})),
		),
		listMixComments(song.id),
		songChat(song.id, canComment ? userId : null),
		canEdit ? listShareLinks({ songId: song.id }) : [],
	]);
	return {
		song: {
			id: song.id,
			title: song.title,
			slug: song.slug,
			isPrivate: song.isPrivate,
			project: {
				name: song.project.name,
				slug: song.project.slug,
				isPrivate: song.project.isPrivate,
			},
		},
		mixId: chosen.id,
		mixes,
		mixComments,
		chat,
		shareLinks,
		canEdit,
		canComment,
	};
};
