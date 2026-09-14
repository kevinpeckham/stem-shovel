import { requireMember, requireSignedIn } from "$lib/server/access";
import { accountUsage, pendingInvitations } from "$lib/server/data";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ parent, locals, url }) => {
	requireSignedIn(locals, url);
	const { account } = await parent();
	const member = requireMember(locals, account.id);
	const canInvite = member.role === "owner" || member.role === "admin";
	return {
		usage: await accountUsage(account.id),
		canInvite,
		invitations: canInvite ? await pendingInvitations(account.id) : [],
	};
};
