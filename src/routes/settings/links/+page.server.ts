import { requireSignedIn } from "#lib/server/access.js";
import { listShortLinksOf } from "#lib/server/shortLinks.js";
import { ENV } from "varlock/env";
import type { PageServerLoad } from "./$types";

/**
 * The signed-in user's short links (docs/security.md "Short links"), with
 * what the page needs to write their addresses as the mint does: the short
 * domain where the stage has one, else this origin's `/x/`.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireSignedIn(locals, url);
	return {
		links: await listShortLinksOf(user.id),
		shortOrigin: ENV.SHORT_LINK_ORIGIN ?? null,
		origin: url.origin,
	};
};
