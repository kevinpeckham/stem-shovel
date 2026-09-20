import { requireMember, requireSignedIn } from "$lib/server/access";
import {
	accountDefaultArtist,
	accountUsage,
	listArtists,
	listInviteCodes,
	pendingInvitations,
} from "$lib/server/data";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ parent, locals, url }) => {
	requireSignedIn(locals, url);
	const { account } = await parent();
	const member = requireMember(locals, account.id);
	const canInvite = member.role === "owner" || member.role === "admin";
	return {
		usage: await accountUsage(account.id),
		canInvite,
		myRole: member.role,
		invitations: canInvite ? await pendingInvitations(account.id) : [],
		inviteCodes: canInvite ? await listInviteCodes(account.id) : [],
		/** The artist directory and which artist new songs are credited to. */
		artists: await listArtists(account.id),
		defaultArtistId: await accountDefaultArtist(account.id),
	};
};
