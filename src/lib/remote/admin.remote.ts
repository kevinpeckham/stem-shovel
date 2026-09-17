import { form, getRequestEvent } from "$app/server";
import { requireSuperAdmin, requireSystemAdmin } from "$lib/server/access";
import {
	createInviteCode,
	deleteAccount,
	listPublicSongs,
	markWaitlistInvited,
	removeWaitlist,
	setAccountFounder,
	setAppSetting,
	waitlistById,
	deleteUser,
	revokeInviteCode,
	setAccountStatus,
	setUserActive,
} from "$lib/server/data";
import { InviteCodeIdSchema, SystemInviteCodeCreateSchema } from "$lib/val/InviteCodeSchema";
import { AccountAdminSchema } from "$lib/val/AccountAdminSchema";
import { FeaturedSongSchema } from "$lib/val/FeaturedSongSchema";
import { WaitlistAdminSchema } from "$lib/val/WaitlistSchema";
import { waitlistManageUrl } from "$lib/utils/waitlistManageUrl";
import { sendWaitlistConfirmEmail, sendWaitlistInviteEmail } from "$lib/server/email";
import { background } from "$lib/server/background";
import { UserAdminSchema } from "$lib/val/UserAdminSchema";
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

/** Suspend (signs them out, blocks sign-in), reactivate, or delete a user — never oneself. */
export const manageUser = form(UserAdminSchema, async ({ id, action }) => {
	const { locals } = getRequestEvent();
	const admin = requireSystemAdmin(locals);
	if (id === admin.id) error(400, "You cannot suspend or delete your own user");
	if (action === "delete") {
		const result = await deleteUser(id);
		if (!result) error(404, "User not found");
		return { action, accountsRemoved: result.accountsRemoved };
	}
	if (!(await setUserActive(id, action === "reactivate"))) error(404, "User not found");
	return { action, accountsRemoved: 0 };
});

/**
 * Suspend (closes every page and mutation of the account), reactivate, or
 * delete an account with all its files; grant or revoke founder status
 * (super admins only).
 */
export const manageAccount = form(AccountAdminSchema, async ({ id, action }) => {
	const { locals } = getRequestEvent();
	requireSystemAdmin(locals);
	if (action === "founder" || action === "unfounder") {
		requireSuperAdmin(locals);
		if (!(await setAccountFounder(id, action === "founder"))) error(404, "Account not found");
		return { action };
	}
	if (action === "delete") {
		if (!(await deleteAccount(id))) error(404, "Account not found");
		return { action };
	}
	if (!(await setAccountStatus(id, action === "suspend" ? "suspended" : "active"))) {
		error(404, "Account not found");
	}
	return { action };
});

/** The song the home page demos: any public song with stems (system admins). */
export const setFeaturedSong = form(FeaturedSongSchema, async ({ songId }) => {
	const { locals } = getRequestEvent();
	requireSystemAdmin(locals);
	if (!(await listPublicSongs()).some((s) => s.id === songId))
		error(400, "That song is not public, or has no stems");
	await setAppSetting("featuredSongId", songId);
	return { saved: true };
});

const WAITLIST_INVITE_DAYS = 30;

/**
 * The waitlist from /admin: invite (a single-use new-account code, emailed),
 * resend a confirmation, or remove the entry. Only a confirmed address can
 * be invited.
 */
export const manageWaitlist = form(WaitlistAdminSchema, async ({ id, action }) => {
	const { locals, url } = getRequestEvent();
	const admin = requireSystemAdmin(locals);
	const entry = await waitlistById(id);
	if (!entry) error(404, "Not on the waitlist");
	if (action === "remove") {
		await removeWaitlist(id);
		return { action };
	}
	if (action === "resend") {
		if (entry.status !== "pending") error(409, "That address is not waiting for confirmation");
		background(() =>
			sendWaitlistConfirmEmail({
				to: entry.email,
				name: entry.name,
				confirmUrl: `${url.origin}/waitlist/confirm/${entry.confirmToken}`,
				manageUrl: waitlistManageUrl(url.origin, entry.manageToken),
				updatesOk: entry.updatesOk,
			}),
		);
		return { action };
	}
	if (entry.status !== "confirmed") error(409, "Only a confirmed address can be invited");
	const code = await createInviteCode(null, admin.id, {
		role: "member",
		note: `waitlist: ${entry.email}`,
		maxUses: 1,
		expiresDays: WAITLIST_INVITE_DAYS,
	});
	await markWaitlistInvited(entry.id, code.id);
	// Sent after the response; the code is on the page regardless.
	background(() =>
		sendWaitlistInviteEmail({
			to: entry.email,
			name: entry.name,
			code: code.code,
			signUpUrl: `${url.origin}/sign-up?code=${code.code}`,
			manageUrl: waitlistManageUrl(url.origin, entry.manageToken),
			expiresDays: WAITLIST_INVITE_DAYS,
		}),
	);
	return { action };
});
