import { form, getRequestEvent } from "$app/server";
import {
	accountOfArtist,
	accountOfArtistMember,
	memberOf,
	requireMember,
	requireUser,
} from "$lib/server/access";
import {
	addArtistMember as addMember,
	artistById,
	artistMemberById,
	createInvitation,
	deleteArtist as removeArtist,
	removeArtistMember as removeMember,
	updateArtist as update,
} from "$lib/server/data";
import { sendInvitationEmail } from "$lib/server/email";
import { HOUR, rateLimited } from "$lib/server/rateLimit";
import { IdSchema } from "$lib/val/SongSchema";
import {
	ArtistInviteSchema,
	ArtistMemberAddSchema,
	ArtistMemberInviteSchema,
	ArtistUpdateSchema,
} from "$lib/val/ArtistSchema";
import { error, invalid, redirect } from "@sveltejs/kit";

/**
 * The artist directory (/[account]/artists): an artist's details, its
 * people, and inviting one of them into the account. Editors edit; the
 * invitation follows the account's own rule (owners and admins).
 */

export const updateArtist = form(ArtistUpdateSchema, async ({ id, ...input }, issue) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfArtist, id);
	if (!(await update(accountId, id, input)))
		invalid(issue.name("Another artist in this account already has that name."));
	return { saved: true };
});

/** Deletes the artist with its people and every credit naming it; lands on the directory. */
export const deleteArtist = form(IdSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	const m = await memberOf(locals, accountOfArtist, id);
	if (!(await removeArtist(m.accountId, id))) error(404, "Artist not found");
	redirect(303, `/${m.slug}/artists`);
});

export const addArtistMember = form(ArtistMemberAddSchema, async ({ artistId, ...input }) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfArtist, artistId);
	const row = await addMember(accountId, artistId, input);
	if (!row) error(404, "Artist not found");
	return { added: row.id };
});

export const removeArtistMember = form(IdSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfArtistMember, id);
	if (!(await removeMember(accountId, id))) error(404, "Person not found");
	return { removed: true };
});

/** Invites the person (their recorded email) into the account, as the settings page would. */
export const inviteArtistMember = form(ArtistMemberInviteSchema, async ({ id, role }, issue) => {
	const { locals, url } = getRequestEvent();
	const user = requireUser(locals);
	const person = await artistMemberById(id);
	if (!person) error(404, "Person not found");
	const m = requireMember(locals, person.artist.accountId);
	if (m.role !== "owner" && m.role !== "admin") error(403, "Only owners and admins can invite");
	if (!person.email) invalid(issue.id("Add an email address for them first."));
	if (await rateLimited(`invite:${user.id}`, 30, HOUR))
		error(429, "Too many invitations in one hour.");
	const row = await createInvitation(m.accountId, user.id, person.email, role);
	if (row === "member") invalid(issue.id("They are already a member of this account."));
	await sendInvitationEmail({
		to: row.email,
		url: `${url.origin}/invite/${row.token}`,
		accountName: m.name,
		inviterName: user.name || user.email,
		inviterEmail: user.email,
		role: row.role,
	});
	return { sent: true, email: row.email };
});

/** Invites a solo artist (the email on the record) into the account. */
export const inviteArtist = form(ArtistInviteSchema, async ({ id, role }, issue) => {
	const { locals, url } = getRequestEvent();
	const user = requireUser(locals);
	const who = await artistById(id);
	if (!who) error(404, "Artist not found");
	const m = requireMember(locals, who.accountId);
	if (m.role !== "owner" && m.role !== "admin") error(403, "Only owners and admins can invite");
	if (!who.email) invalid(issue.id("Add the artist's email address first."));
	if (await rateLimited(`invite:${user.id}`, 30, HOUR))
		error(429, "Too many invitations in one hour.");
	const row = await createInvitation(m.accountId, user.id, who.email, role);
	if (row === "member") invalid(issue.id("They are already a member of this account."));
	await sendInvitationEmail({
		to: row.email,
		url: `${url.origin}/invite/${row.token}`,
		accountName: m.name,
		inviterName: user.name || user.email,
		inviterEmail: user.email,
		role: row.role,
	});
	return { sent: true, email: row.email };
});
