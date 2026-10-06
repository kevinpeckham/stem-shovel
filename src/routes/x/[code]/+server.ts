import { resolveShortLink } from "$lib/server/shortLinks";
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/**
 * A short link resolved on the app's own origin: `/x/<code>` sends the
 * visitor to the page the code stands for, query and hash included (the
 * chord player's settings ride in the hash, which a Location header
 * carries). The short domain (`SHORT_LINK_ORIGIN`, src/hooks.server.ts)
 * resolves the same codes as `/<code>`; this address is what a stage
 * without the domain hands out, and a fallback everywhere. A code nobody
 * made, or one that has expired, is a 404. Never cached: a link that
 * expires must stop.
 */
export const GET: RequestHandler = async ({ params, url }) => {
	const link = await resolveShortLink(params.code);
	if (!link) error(404, "This short link is not one Stem Shovel made, or it has expired.");
	return new Response(null, {
		status: 302,
		headers: { location: `${url.origin}${link.target}`, "cache-control": "no-store" },
	});
};
