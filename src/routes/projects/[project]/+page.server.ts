import { getProject } from "$lib/server/data";
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals }) => {
	const project = await getProject(locals.account.id, params.project);
	if (!project) error(404, `No project "${params.project}"`);
	return { project };
};
