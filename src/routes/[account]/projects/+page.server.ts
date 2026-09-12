import { listProjects } from "$lib/server/data";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ parent }) => {
	const { account } = await parent();
	return { projects: await listProjects(account.id) };
};
