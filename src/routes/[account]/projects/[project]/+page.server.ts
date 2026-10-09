import {
	getProject,
	listAccountMembers,
	listProjectFiles,
	listProjectPeople,
	listProjectScores,
	listShareLinks,
	songsWantingMix,
	userNoteSongIds,
} from "#lib/server/data.js";
import { presentUrl } from "#lib/server/blob.js";
import {
	canCommentProject,
	canEditProject,
	canViewProject,
	canViewSong,
} from "#lib/server/viewAccess.js";
import { mixKeyOf } from "#lib/server/mix.js";
import { scheduleMix } from "#lib/server/jobs.js";
import type { Config } from "@sveltejs/adapter-vercel";
import { renamedProjectPath } from "#lib/server/slugAlias.js";
import { error, redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/** Missing mixes render after the response, inside this function's lifetime. */
export const config: Config = { maxDuration: 300 };

export const load: PageServerLoad = async ({ params, parent, url, locals }) => {
	const { account, who, shareGrants } = await parent();
	const project = await getProject(account.id, params.project);
	if (!project) {
		// An address the project used to have redirects to the current one (src/lib/server/slugAlias.ts).
		const to = await renamedProjectPath(url, account.id, params.project);
		if (to) redirect(308, to);
		error(404, `No project "${params.project}"`);
	}
	if (!canViewProject(project, who, shareGrants)) {
		error(403, "This project is private. Sign in as a member, or open the link you were given.");
	}
	// This project's own answer, narrower than the account's on a restricted project.
	const canEdit = canEditProject(project, who);
	// Private songs inside a public project show only to those who may view them.
	const songs = project.songs.filter((s) =>
		canViewSong(
			{ ...s, project: { isPrivate: project.isPrivate, isRestricted: project.isRestricted } },
			who,
			shareGrants,
		),
	);
	// Backstop: songs whose cached mix predates their current stems.
	scheduleMix(songsWantingMix(songs, mixKeyOf));
	// The playlist plays each song's newest mix (docs/mixes.md), else the stems' bounce, or its demos
	// (the rendition where it is ready, the upload otherwise); a private song's need presigned URLs.
	// The tiles count each song's charts (scores and files marked as notation) and the viewer's own private notes.
	const myNotes = locals.user
		? await userNoteSongIds(
				locals.user.id,
				songs.map((s) => s.id),
			)
		: new Set<string>();
	// The project's library: every ready attachment (the songs' and the project's own) and every score, minus those of songs the viewer may not see.
	const visible = new Set(songs.map((s) => s.id));
	const [presented, shareLinks, people, accountMembers, files, scores] = await Promise.all([
		Promise.all(
			songs.map(async (s) => ({
				...s,
				chartFiles:
					s.notation.filter((n) => n.status === "ready").length +
					s.files.filter((f) => f.status === "ready" && f.isNotation).length,
				hasMyNote: myNotes.has(s.id),
				mixUrl: await presentUrl(s.mixUrl),
				// The mixes (docs/mixes.md): the newest ready one plays in place of the stems' bounce (Kevin: the latest content by default).
				mixCount: s.mixes.filter((m) => m.status === "ready").length,
				latestMix: await (async () => {
					const m = s.mixes.find((x) => x.status === "ready" && x.url);
					if (!m) return null;
					const playUrl = await presentUrl(
						m.playbackStatus === "ready" && m.playbackUrl ? m.playbackUrl : m.url,
					);
					return playUrl ? { id: m.id, version: m.version, label: m.label, playUrl } : null;
				})(),
				demos: await Promise.all(
					s.demos.map(async (d) => ({
						...d,
						playUrl:
							d.status === "ready"
								? await presentUrl(
										d.playbackStatus === "ready" && d.playbackUrl ? d.playbackUrl : d.url,
									)
								: null,
					})),
				),
			})),
		),
		canEdit ? listShareLinks({ projectId: project.id }) : [],
		canEdit ? listProjectPeople(account.id, project.id) : { people: [], invitations: [] },
		canEdit ? listAccountMembers(account.id) : [],
		listProjectFiles(account.id, project.id),
		listProjectScores(account.id, project.id),
	]);
	return {
		project: { ...project, songs: presented, imageUrl: await presentUrl(project.imageUrl) },
		/** Attachments of the project and its songs, newest first, each with its song or null at the project level (docs/uploads-and-blob.md, "Attachments"). */
		files: files.filter((f) => !f.song || visible.has(f.song.id)),
		/** Notation files of the project's songs with their rendered PDFs (docs/uploads-and-blob.md, "Notation files"). */
		scores: scores.filter((n) => visible.has(n.song.id)),
		shareLinks,
		canEdit,
		canComment: canCommentProject(project, who),
		/** Who was added to the project, its open viewer invitations, and the account's members (to add one). */
		people: people.people,
		invitations: people.invitations,
		accountMembers,
	};
};
