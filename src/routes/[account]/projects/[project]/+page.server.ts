import { getProject, songsWantingMix } from "$lib/server/data";
import { mixKeyOf, scheduleMix } from "$lib/server/mix";
import type { Config } from "@sveltejs/adapter-vercel";
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/** Missing mixes render after the response, inside this function's lifetime. */
export const config: Config = { maxDuration: 300 };

export const load: PageServerLoad = async ({ params, parent }) => {
	const { account } = await parent();
	const project = await getProject(account.id, params.project);
	if (!project) error(404, `No project "${params.project}"`);
	// Backstop: songs whose cached mix predates their current stems.
	scheduleMix(songsWantingMix(project.songs, mixKeyOf));
	return { project };
};
