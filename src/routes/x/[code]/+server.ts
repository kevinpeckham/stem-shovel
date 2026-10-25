import { resolveShortLink } from "#lib/server/shortLinks.js";
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/**
 * A short link resolved on the app's own origin: `/x/<code>`, or a
 * custom address `/x/<slug>` in any case, sends the visitor to the page
 * the link stands for, query and hash included (the chord player's
 * settings ride in the hash, which a Location header carries). The short domain (`SHORT_LINK_ORIGIN`, src/hooks.server.ts)
 * resolves the same addresses as `/<code>`; this address is what a stage
 * without the domain hands out, and a fallback everywhere. A code nobody
 * made, or one that has expired, is a 404. Never cached: a link that
 * expires must stop.
 */
export const GET: RequestHandler = async ({ params }) => {
	const link = await resolveShortLink(params.code);
	if (!link) error(404, "This short link is not one Stem Shovel made, or it has expired.");
	// A relative Location: the browser resolves it against the address it used, so a stage behind a proxy that
	// terminates TLS (the dev VM sees http) never sends a visitor to an http address nothing answers (Kevin).
	return new Response(null, {
		status: 302,
		headers: { location: link.target, "cache-control": "no-store" },
	});
};
