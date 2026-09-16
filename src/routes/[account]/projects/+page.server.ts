import { listProjects } from "$lib/server/data";
import { listArchivedProjects } from "$lib/server/projectLifecycle";
import { canViewProject } from "$lib/server/viewAccess";
import type { PageServerLoad } from "./$types";

/** Private projects are listed only for members and for visitors holding a link to them; archived ones only for members. */
export const load: PageServerLoad = async ({ parent }) => {
	const { account, canEdit, shareGrants } = await parent();
	const projects = await listProjects(account.id);
	return {
		projects: projects.filter((p) => canViewProject(p, canEdit, shareGrants)),
		archived: canEdit ? await listArchivedProjects(account.id) : [],
	};
};
