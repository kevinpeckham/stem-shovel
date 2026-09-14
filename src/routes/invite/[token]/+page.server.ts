import { invitationByToken } from "$lib/server/data";
import type { PageServerLoad } from "./$types";

/**
 * The link from an invitation email. Anyone can open it; joining needs a
 * signed-in user whose address matches, so the page steers the rest.
 */
export const load: PageServerLoad = async ({ params, locals }) => {
	const found = await invitationByToken(params.token);
	if (found.status !== "open") return { status: found.status, token: params.token };
	const inv = found.invitation;
	const alreadyMember = locals.memberships.some((m) => m.accountId === inv.accountId);
	return {
		status: alreadyMember ? ("member" as const) : ("open" as const),
		token: params.token,
		email: inv.email,
		role: inv.role,
		account: inv.account,
		mismatch: !!locals.user && locals.user.email.toLowerCase() !== inv.email,
	};
};
