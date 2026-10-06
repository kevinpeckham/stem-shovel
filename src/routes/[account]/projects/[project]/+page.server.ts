import {
	getProject,
	listAccountMembers,
	listProjectPeople,
	listShareLinks,
	songsWantingMix,
	userNoteSongIds,
} from "$lib/server/data";
import { presentUrl } from "$lib/server/blob";
import {
	canCommentProject,
	canEditProject,
	canViewProject,
	canViewSong,
} from "$lib/server/viewAccess";
import { mixKeyOf } from "$lib/server/mix";
import { scheduleMix } from "$lib/server/jobs";
import type { Config } from "@sveltejs/adapter-vercel";
import { renamedProjectPath } from "$lib/server/slugAlias";
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
	// The playlist plays each song's mix, or its demos (the AAC rendition where it is ready, the
	// upload otherwise); a private song's need presigned URLs.
	// The tiles count each song's charts (scores and files marked as notation) and the viewer's own private notes.
	const myNotes = locals.user
		? await userNoteSongIds(
				locals.user.id,
				songs.map((s) => s.id),
			)
		: new Set<string>();
	const [presented, shareLinks, people, accountMembers] = await Promise.all([
		Promise.all(
			songs.map(async (s) => ({
				...s,
				chartFiles:
					s.notation.filter((n) => n.status === "ready").length +
					s.files.filter((f) => f.status === "ready" && f.isNotation).length,
				hasMyNote: myNotes.has(s.id),
				mixUrl: await presentUrl(s.mixUrl),
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
	]);
	return {
		project: { ...project, songs: presented, imageUrl: await presentUrl(project.imageUrl) },
		shareLinks,
		canEdit,
		canComment: canCommentProject(project, who),
		/** Who was added to the project, its open viewer invitations, and the account's members (to add one). */
		people: people.people,
		invitations: people.invitations,
		accountMembers,
	};
};
