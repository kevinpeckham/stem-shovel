import { form, getRequestEvent } from "$app/server";
import { requireMember, requireUser } from "$lib/server/access";
import {
	acceptInvitation as accept,
	createInvitation,
	revokeInvitation as revoke,
	updateAccount as update,
} from "$lib/server/data";
import { sendInvitationEmail } from "$lib/server/email";
import { AccountSettingsSchema } from "$lib/val/AccountSchema";
import { InvitationIdSchema, InvitationTokenSchema, InviteSchema } from "$lib/val/InvitationSchema";
import { error, invalid, redirect } from "@sveltejs/kit";

/**
 * Account (org) settings: name and slug. Only the account the caller belongs
 * to can be edited; the id in the form must match it.
 */
export const updateAccount = form(AccountSettingsSchema, async ({ id, name, slug }, issue) => {
	const { locals } = getRequestEvent();
	const m = requireMember(locals, id);
	if (m.role !== "owner" && m.role !== "admin") {
		error(403, "Only owners and admins can change account settings");
	}
	const result = await update(id, { name, slug });
	if (!result.ok) invalid(issue[result.field](result.error));
	redirect(303, `/${result.account.slug}/settings`);
});

/** Invites an address into the account (owners and admins) and emails the link. */
export const inviteMember = form(InviteSchema, async ({ accountId, email, role }, issue) => {
	const { locals, url } = getRequestEvent();
	const user = requireUser(locals);
	const m = requireMember(locals, accountId);
	if (m.role !== "owner" && m.role !== "admin") error(403, "Only owners and admins can invite");
	const row = await createInvitation(accountId, user.id, email, role);
	if (row === "member") invalid(issue.email("That address already belongs to a member."));
	await sendInvitationEmail({
		to: row.email,
		url: `${url.origin}/invite/${row.token}`,
		accountName: m.name,
		inviterName: user.name || user.email,
		inviterEmail: user.email,
		role: row.role,
	});
	return { sent: row.email };
});

export const revokeInvitation = form(InvitationIdSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	// The invitation's account is checked inside revoke(); find which of the caller's accounts it is in.
	for (const m of locals.memberships) {
		if (m.role !== "owner" && m.role !== "admin") continue;
		if (await revoke(m.accountId, id)) return { revoked: true };
	}
	error(404, "Invitation not found");
});

/** Joins the account behind an invitation link (signed in, matching address). */
export const acceptInvitation = form(InvitationTokenSchema, async ({ token }) => {
	const { locals } = getRequestEvent();
	const user = requireUser(locals);
	const result = await accept(token, user);
	if (typeof result === "string")
		error(
			400,
			`This invitation is ${result === "mismatch" ? "for a different email address" : result}.`,
		);
	redirect(303, `/${result.account.slug}/projects`);
});
