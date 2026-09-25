import {
	getProject,
	listAccountMembers,
	listProjectPeople,
	listShareLinks,
	songsWantingMix,
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
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/** Missing mixes render after the response, inside this function's lifetime. */
export const config: Config = { maxDuration: 300 };

export const load: PageServerLoad = async ({ params, parent }) => {
	const { account, who, shareGrants } = await parent();
	const project = await getProject(account.id, params.project);
	if (!project) error(404, `No project "${params.project}"`);
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
	// The playlist plays each song's mix; a private song's needs a presigned URL.
	const [presented, shareLinks, people, accountMembers] = await Promise.all([
		Promise.all(songs.map(async (s) => ({ ...s, mixUrl: await presentUrl(s.mixUrl) }))),
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
