import { form, getRequestEvent } from "$app/server";
import { requireSystemAdmin } from "$lib/server/access";
import { createInviteCode, revokeInviteCode } from "$lib/server/data";
import { InviteCodeIdSchema, SystemInviteCodeCreateSchema } from "$lib/val/InviteCodeSchema";
import { error } from "@sveltejs/kit";

/**
 * System admin only (user.isSystemAdmin, set by `bun run db:system-admin`).
 * A system invite code has no account: whoever signs up with it gets their
 * own workspace and nothing else.
 */
export const createSystemInviteCode = form(
	SystemInviteCodeCreateSchema,
	async ({ note, maxUses, expiresDays }) => {
		const { locals } = getRequestEvent();
		const user = requireSystemAdmin(locals);
		const row = await createInviteCode(null, user.id, {
			role: "member",
			note,
			maxUses,
			expiresDays,
		});
		return { code: row.code };
	},
);

export const revokeSystemInviteCode = form(InviteCodeIdSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	requireSystemAdmin(locals);
	if (await revokeInviteCode(null, id)) return { revoked: true };
	error(404, "Invite code not found");
});
