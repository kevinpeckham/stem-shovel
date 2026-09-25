import { listProjects } from "$lib/server/data";
import { presentUrl } from "$lib/server/blob";
import { listArchivedProjects } from "$lib/server/projectLifecycle";
import { canViewProject } from "$lib/server/viewAccess";
import type { PageServerLoad } from "./$types";

/** Private projects are listed only for members and for visitors holding a link to them; archived ones only for members. */
export const load: PageServerLoad = async ({ parent }) => {
	const { account, canEdit, who, shareGrants } = await parent();
	const projects = await Promise.all(
		(await listProjects(account.id)).map(async (p) => ({
			...p,
			imageUrl: await presentUrl(p.imageUrl),
		})),
	);
	return {
		projects: projects.filter((p) => canViewProject(p, who, shareGrants)),
		archived: canEdit ? await listArchivedProjects(account.id) : [],
	};
};
