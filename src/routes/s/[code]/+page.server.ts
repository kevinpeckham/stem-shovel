import { shareLinkTarget } from "#lib/server/data.js";
import { error, redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/**
 * A share link's own address: `/s/<code>` finds the song or project the
 * code was made for and sends the visitor to its current page with the
 * code attached, so a link survives any rename of the account, project or
 * song (the page then checks the code as it always did). A code nobody
 * made is a 404; a revoked or used-up one still reaches the page, which
 * explains itself.
 */
export const load: PageServerLoad = async ({ params }) => {
	const path = await shareLinkTarget(params.code);
	if (!path) error(404, "This link is not one Stem Shovel made.");
	// A link made for a mix already carries its query (docs/mixes.md).
	redirect(307, `${path}${path.includes("?") ? "&" : "?"}share=${encodeURIComponent(params.code)}`);
};
