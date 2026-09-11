import { listProjects } from "$lib/server/data";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	return { projects: await listProjects(locals.account.id) };
};
