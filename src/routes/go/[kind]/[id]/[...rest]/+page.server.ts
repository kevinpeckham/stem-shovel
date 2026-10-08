import { permalinkTarget } from "#lib/server/data.js";
import { PERMALINK_KINDS, type PermalinkKind } from "#lib/utils/permalink.js";
import { error, redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/**
 * A permanent address for a song, a project or an account by its id
 * (`src/lib/utils/permalink.ts`): `/go/song/<id>`, `/go/project/<id>`,
 * `/go/account/<id>/settings`. Stored links (notifications, digest emails)
 * use it, so a rename never leaves them pointing at a page that moved; the
 * visitor is sent on to the current address, any trailing path and query
 * carried along (docs/notifications.md). An id nobody has is a 404.
 */
export const load: PageServerLoad = async ({ params, url }) => {
	if (!PERMALINK_KINDS.includes(params.kind as PermalinkKind)) error(404, "Not found");
	const path = await permalinkTarget(params.kind as PermalinkKind, params.id);
	if (!path) error(404, "Not found");
	redirect(307, `${path}${params.rest ? `/${params.rest}` : ""}${url.search}`);
};
