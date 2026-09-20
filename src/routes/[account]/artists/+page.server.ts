import { requireMember, requireSignedIn } from "$lib/server/access";
import { accountDefaultArtist, listArtistsWithCounts } from "$lib/server/data";
import type { PageServerLoad } from "./$types";

/** The account's artist directory: members only (it carries people's emails). */
export const load: PageServerLoad = async ({ parent, locals, url }) => {
	requireSignedIn(locals, url);
	const { account } = await parent();
	requireMember(locals, account.id);
	const [artists, defaultArtistId] = await Promise.all([
		listArtistsWithCounts(account.id),
		accountDefaultArtist(account.id),
	]);
	return { artists, defaultArtistId };
};
