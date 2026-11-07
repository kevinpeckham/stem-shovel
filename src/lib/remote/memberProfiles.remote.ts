import { form, getRequestEvent } from "$app/server";
import { requireMember, requireUser } from "#lib/server/access.js";
import { isAccountAdmin } from "#lib/server/viewAccess.js";
import { updateMemberProfile as update } from "#lib/server/data.js";
import { MemberProfileUpdateSchema } from "#lib/val/MemberProfileSchema.js";
import { error } from "@sveltejs/kit";

/**
 * A member's phone, instruments and notes in the account (docs/band-plan.md,
 * "The band directory"): the member themselves, or an owner or admin of it.
 */
export const updateMemberProfile = form(
	MemberProfileUpdateSchema,
	async ({ accountId, userId, ...fields }) => {
		const { locals } = getRequestEvent();
		const user = requireUser(locals);
		const m = requireMember(locals, accountId);
		if (user.id !== userId && !isAccountAdmin(m.role))
			error(403, "Only the member or an admin may edit this profile.");
		if (!(await update(accountId, userId, fields))) error(404, "Not found");
		return { ok: true };
	},
);
