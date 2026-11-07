import { listMemberProfiles } from "#lib/server/data.js";
import { memberPageAccount } from "#lib/server/memberPageAccount.js";
import { isAccountAdmin } from "#lib/server/viewAccess.js";
import type { PageServerLoad } from "./$types";

/**
 * The band directory's members (docs/band-plan.md, "The band directory"):
 * every member with their phone, instruments and notes. Members only; the
 * viewer edits their own profile, an owner or admin anyone's.
 */
export const load: PageServerLoad = async (event) => {
	const account = await memberPageAccount(event);
	const { locals } = event;
	const role = locals.memberships.find((m) => m.accountId === account.id)?.role;
	return {
		members: await listMemberProfiles(account.id),
		myUserId: locals.user?.id ?? "",
		canManage: isAccountAdmin(role),
	};
};
