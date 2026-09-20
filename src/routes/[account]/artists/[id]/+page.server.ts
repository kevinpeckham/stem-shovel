import { requireMember, requireSignedIn } from "$lib/server/access";
import { getArtist, memberEmails } from "$lib/server/data";
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/** One artist: details, people (with whether each is already in the account) and the songs crediting it. */
export const load: PageServerLoad = async ({ params, parent, locals, url }) => {
	requireSignedIn(locals, url);
	const { account } = await parent();
	const member = requireMember(locals, account.id);
	const [artist, emails] = await Promise.all([
		getArtist(account.id, params.id),
		memberEmails(account.id),
	]);
	if (!artist) error(404, "Artist not found");
	return {
		artist: {
			...artist,
			inAccount: !!artist.email && emails.has(artist.email),
			members: artist.members.map((m) => ({ ...m, inAccount: !!m.email && emails.has(m.email) })),
		},
		canInvite: member.role === "owner" || member.role === "admin",
		/** Members' emails (lowercased), so the page can say as you type whether a person is already in. */
		memberEmails: [...emails],
	};
};
