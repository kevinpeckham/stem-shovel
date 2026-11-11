import { presentUrl } from "#lib/server/blob.js";
import {
	demosWantingPeaks,
	demosWantingPlayback,
	listDemoComments,
	listShareLinks,
	songDemo,
} from "#lib/server/data.js";
import { scheduleDemoPeaks, scheduleDemoPlayback } from "#lib/server/jobs.js";
import { canCommentProject, canEditProject, canViewSong } from "#lib/server/viewAccess.js";
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/**
 * A demo recording's own page, as a mix has one (docs/mixes.md): what a
 * demo's share link opens. Loads only what listening needs: the song's
 * name and privacy, the demo with URLs the browser may fetch, its comments,
 * and the song's share links for an editor. Viewing follows the song's rule
 * (members, share links, public songs); a share code for the demo is the
 * song's code, so it opens the song as well.
 */
export const load: PageServerLoad = async ({ params, parent }) => {
	const { account, who, shareGrants } = await parent();
	const found = await songDemo(account.id, params.project, params.song, params.demo);
	if (!found) error(404, `No song "${params.song}" in "${params.project}"`);
	const { song, demo } = found;
	if (!canViewSong(song, who, shareGrants)) {
		error(403, "This song is private. Sign in as a member, or open the link you were given.");
	}
	if (!demo || demo.status !== "ready" || !demo.url) error(404, "No such demo of this song");
	// The jobs function's backstops, as the song page runs them: the MP3, then its waveform.
	scheduleDemoPlayback(demosWantingPlayback([demo]));
	scheduleDemoPeaks(demosWantingPeaks([demo]));
	const canEdit = canEditProject(song.project, who);
	const [url, playbackUrl, comments, shareLinks] = await Promise.all([
		presentUrl(demo.url),
		presentUrl(demo.playbackUrl),
		listDemoComments(song.id),
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
		demo: {
			id: demo.id,
			label: demo.label,
			filename: demo.filename,
			sizeBytes: demo.sizeBytes,
			url: url ?? demo.url,
			playbackUrl,
			peaks: demo.peaks ?? null,
			durationSeconds: demo.durationSeconds ?? null,
			createdAt: demo.createdAt,
			uploader: demo.uploader ? { name: demo.uploader.name } : null,
		},
		comments: comments.filter((c) => c.demoId === demo.id),
		shareLinks,
		canEdit,
		canComment: canCommentProject(song.project, who),
	};
};
