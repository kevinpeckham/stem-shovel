import { indexableStage } from "$lib/constants/securityHeaders";
import type { RequestHandler } from "./$types";
import { ENV } from "varlock/env";

export const prerender = false;

/**
 * Production: only the front page is for search engines (everything else is a
 * private app whose responses carry X-Robots-Tag: noindex). Staging, previews
 * and dev: nothing at all.
 */
export const GET: RequestHandler = ({ url }) => {
	const body = indexableStage(ENV.VERCEL_ENV)
		? `# Only the front page is for search engines; everything else is a private app.\nUser-agent: *\nAllow: /$\nDisallow: /\nSitemap: ${url.origin}/sitemap.xml\n`
		: `# Not production: nothing here is for search engines.\nUser-agent: *\nDisallow: /\n`;
	return new Response(body, {
		headers: {
			"content-type": "text/plain; charset=utf-8",
			"cache-control": "public, max-age=3600",
		},
	});
};
