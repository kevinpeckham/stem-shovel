import { accountUsage } from "$lib/server/data";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	return { usage: await accountUsage(locals.account.id) };
};
