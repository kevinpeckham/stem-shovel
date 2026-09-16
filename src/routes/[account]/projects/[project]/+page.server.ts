import { getProject, listShareLinks, songsWantingMix } from "$lib/server/data";
import { canViewProject, canViewSong } from "$lib/server/viewAccess";
import { mixKeyOf, scheduleMix } from "$lib/server/mix";
import type { Config } from "@sveltejs/adapter-vercel";
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/** Missing mixes render after the response, inside this function's lifetime. */
export const config: Config = { maxDuration: 300 };

export const load: PageServerLoad = async ({ params, parent }) => {
	const { account, canEdit, shareGrants } = await parent();
	const project = await getProject(account.id, params.project);
	if (!project) error(404, `No project "${params.project}"`);
	if (!canViewProject(project, canEdit, shareGrants)) {
		error(403, "This project is private. Sign in as a member, or open the link you were given.");
	}
	// Private songs inside a public project show only to those who may view them.
	const songs = project.songs.filter((s) =>
		canViewSong({ ...s, project: { isPrivate: project.isPrivate } }, canEdit, shareGrants),
	);
	// Backstop: songs whose cached mix predates their current stems.
	scheduleMix(songsWantingMix(songs, mixKeyOf));
	return {
		project: { ...project, songs },
		shareLinks: canEdit ? await listShareLinks({ projectId: project.id }) : [],
	};
};
