import { requireMember, requireSignedIn } from "$lib/server/access";
import { accountUsage } from "$lib/server/data";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ parent, locals, url }) => {
	requireSignedIn(locals, url);
	const { account } = await parent();
	requireMember(locals, account.id);
	return { usage: await accountUsage(account.id) };
};
