import { form, getRequestEvent } from "$app/server";
import { db, schema } from "$lib/server/db";
import { and, eq } from "drizzle-orm";
import { requireEditor, requireMember, requireUser } from "$lib/server/access";
import {
	acceptInvitation as accept,
	createInviteCode as newInviteCode,
	createInvitation,
	revokeInviteCode as dropInviteCode,
	createOwnedAccount,
	removeMembership,
	revokeInvitation as revoke,
	setMemberRole as changeRole,
	setAccountDefaultArtist,
	updateAccount as update,
} from "$lib/server/data";
import { sendInvitationEmail } from "$lib/server/email";
import {
	AccountCreateSchema,
	AccountDefaultArtistSchema,
	AccountSettingsSchema,
} from "$lib/val/AccountSchema";
import { InvitationIdSchema, InvitationTokenSchema, InviteSchema } from "$lib/val/InvitationSchema";
import { InviteCodeCreateSchema, InviteCodeIdSchema } from "$lib/val/InviteCodeSchema";
import {
	LeaveAccountSchema,
	MemberRoleChangeSchema,
	MembershipSchema,
} from "$lib/val/MembershipSchema";
import { CURRENT_ACCOUNT_COOKIE, rememberAccount } from "$lib/server/currentAccount";
import { HOUR, rateLimited } from "$lib/server/rateLimit";
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
	if (await rateLimited(`invite:${user.id}`, 30, HOUR))
		error(429, "Too many invitations in one hour.");
	const row = await createInvitation(accountId, user.id, email, role);
	if (row === "member") invalid(issue.email("That address already belongs to a member."));
	if (row === "full")
		invalid(
			issue.email("This account has no seats left. Remove a member, or ask about more seats."),
		);
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
	if (result === "full")
		error(400, "This account has no seats left. Ask its owner to make room before you join.");
	if (typeof result === "string")
		error(
			400,
			`This invitation is ${result === "mismatch" ? "for a different email address" : result}.`,
		);
	redirect(
		303,
		result.project
			? `/${result.account.slug}/projects/${result.project.slug}`
			: `/${result.account.slug}/projects`,
	);
});

/** Generates a reusable invite code for the account (owners and admins). */
export const createInviteCode = form(
	InviteCodeCreateSchema,
	async ({ accountId, role, note, maxUses, expiresDays }) => {
		const { locals } = getRequestEvent();
		const user = requireUser(locals);
		const m = requireMember(locals, accountId);
		if (m.role !== "owner" && m.role !== "admin") error(403, "Only owners and admins can invite");
		if (await rateLimited(`invitecode:${user.id}`, 30, HOUR))
			error(429, "Too many codes in one hour.");
		const row = await newInviteCode(accountId, user.id, { role, note, maxUses, expiresDays });
		return { code: row.code };
	},
);

export const revokeInviteCode = form(InviteCodeIdSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	for (const m of locals.memberships) {
		if (m.role !== "owner" && m.role !== "admin") continue;
		if (await dropInviteCode(m.accountId, id)) return { revoked: true };
	}
	error(404, "Invite code not found");
});

/** A member leaves an account of their own accord (never the last owner). */
export const leaveAccount = form(LeaveAccountSchema, async ({ accountId }, issue) => {
	const { locals, cookies } = getRequestEvent();
	const user = requireUser(locals);
	requireMember(locals, accountId);
	const result = await removeMembership(accountId, user.id);
	if (!result.ok) invalid(issue.accountId(result.error));
	if (cookies.get(CURRENT_ACCOUNT_COOKIE)) cookies.delete(CURRENT_ACCOUNT_COOKIE, { path: "/" });
	redirect(303, "/accounts");
});

/** Owners and admins remove a member; only an owner removes another owner, and never the last one. */
export const removeMember = form(MembershipSchema, async ({ accountId, userId }, issue) => {
	const { locals } = getRequestEvent();
	const me = requireUser(locals);
	const m = requireMember(locals, accountId);
	if (m.role !== "owner" && m.role !== "admin") error(403, "Only owners and admins remove members");
	if (userId === me.id) error(400, "Leave the account instead of removing yourself");
	const target = await db.query.accountMember.findFirst({
		where: and(
			eq(schema.accountMember.accountId, accountId),
			eq(schema.accountMember.userId, userId),
		),
	});
	if (!target) error(404, "Not a member");
	if (target.role === "owner" && m.role !== "owner") error(403, "Only an owner removes an owner");
	const result = await removeMembership(accountId, userId);
	if (!result.ok) invalid(issue.userId(result.error));
	return { removed: true };
});

/** Owners change roles (and so hand over ownership); admins may set member or viewer. */
export const setMemberRole = form(
	MemberRoleChangeSchema,
	async ({ accountId, userId, role }, issue) => {
		const { locals } = getRequestEvent();
		const m = requireMember(locals, accountId);
		if (m.role !== "owner" && m.role !== "admin") error(403, "Only owners and admins change roles");
		if (m.role !== "owner" && (role === "owner" || role === "admin")) {
			error(403, "Only an owner grants owner or admin");
		}
		const target = await db.query.accountMember.findFirst({
			where: and(
				eq(schema.accountMember.accountId, accountId),
				eq(schema.accountMember.userId, userId),
			),
		});
		if (!target) error(404, "Not a member");
		if (target.role === "owner" && m.role !== "owner") error(403, "Only an owner changes an owner");
		const result = await changeRole(accountId, userId, role);
		if (!result.ok) invalid(issue.role(result.error));
		return { role };
	},
);

/**
 * A new account, owned by the caller. Anyone who already belongs to an
 * account may start another (they were invited in once); no code needed.
 */
export const createAccount = form(AccountCreateSchema, async ({ name }) => {
	const { locals, cookies } = getRequestEvent();
	const user = requireUser(locals);
	if (locals.memberships.length === 0) error(403, "Join an account first");
	if (await rateLimited(`newaccount:${user.id}`, 5, HOUR))
		error(429, "Too many new accounts in one hour.");
	const row = await createOwnedAccount(user.id, name);
	rememberAccount(cookies, row.slug);
	redirect(303, `/${row.slug}/projects`);
});

/** The artist every new song in the account is credited to (any editor may set it; empty clears it). */
export const setDefaultArtist = form(
	AccountDefaultArtistSchema,
	async ({ accountId, artistId }) => {
		const { locals } = getRequestEvent();
		requireEditor(locals, accountId);
		if (!(await setAccountDefaultArtist(accountId, artistId || null)))
			error(404, "Artist not found");
		return { artistId: artistId || null };
	},
);
