import { listProjects } from "$lib/server/data";
import { canViewProject } from "$lib/server/viewAccess";
import type { PageServerLoad } from "./$types";

/** Private projects are listed only for members and for visitors holding a link to them. */
export const load: PageServerLoad = async ({ parent }) => {
	const { account, canEdit, shareGrants } = await parent();
	const projects = await listProjects(account.id);
	return { projects: projects.filter((p) => canViewProject(p, canEdit, shareGrants)) };
};
