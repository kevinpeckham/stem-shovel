import { CURRENT_ACCOUNT_COOKIE, pickAccount } from "$lib/server/currentAccount";
import { listBeats } from "$lib/server/data";
import { realMemberships } from "$lib/utils/actingMemberships";
import type { PageServerLoad } from "./$types";

/**
 * The drum machine works without an account; a signed-in member also gets
 * their account's saved beats (docs/drum-machine.md, Phase 3), the account
 * being the one neutral pages treat as theirs (src/lib/server/currentAccount.ts).
 */
export const load: PageServerLoad = async ({ locals, cookies }) => {
	const member = locals.user
		? pickAccount(realMemberships(locals.memberships), cookies.get(CURRENT_ACCOUNT_COOKIE))
		: null;
	return {
		account: member
			? { id: member.accountId, name: member.name, canEdit: member.role !== "viewer" }
			: null,
		beats: member ? await listBeats(member.accountId) : [],
	};
};
