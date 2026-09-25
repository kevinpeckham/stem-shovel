import { invitationByToken, projectRoleOf } from "$lib/server/data";
import { realMemberships } from "$lib/utils/actingMemberships";
import type { PageServerLoad } from "./$types";

/**
 * The link from an invitation email. Anyone can open it; joining needs a
 * signed-in user whose address matches, so the page steers the rest.
 */
export const load: PageServerLoad = async ({ params, locals }) => {
	const found = await invitationByToken(params.token);
	if (found.status !== "open") return { status: found.status, token: params.token };
	const inv = found.invitation;
	// Real memberships only: a super admin acts as owner everywhere, but that is not membership, and the invitation is how they join for real.
	const alreadyMember = inv.projectId
		? !!locals.user && (await projectRoleOf(inv.projectId, locals.user.id)) !== null
		: realMemberships(locals.memberships).some((m) => m.accountId === inv.accountId);
	return {
		status: alreadyMember ? ("member" as const) : ("open" as const),
		token: params.token,
		email: inv.email,
		role: inv.role,
		account: inv.account,
		/** Set for a viewer invitation to one project. */
		project: inv.project ? { name: inv.project.name, slug: inv.project.slug } : null,
		mismatch: !!locals.user && locals.user.email.toLowerCase() !== inv.email,
	};
};
