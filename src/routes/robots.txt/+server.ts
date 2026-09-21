import { indexableStage } from "$lib/constants/securityHeaders";
import type { RequestHandler } from "./$types";
import { ENV } from "varlock/env";

export const prerender = false;

/**
 * Production: the front page, the docs and the Releases page are for search
 * engines (src/lib/utils/isIndexablePath.ts; everything else is a private app
 * whose responses carry X-Robots-Tag: noindex). Staging, previews and dev:
 * nothing at all.
 */
export const GET: RequestHandler = ({ url }) => {
	const body = indexableStage(ENV.VERCEL_ENV)
		? `# The front page, the docs and the releases page are for search engines; everything else is a private app.\nUser-agent: *\nAllow: /$\nAllow: /docs\nAllow: /blog\nAllow: /releases$\nAllow: /tuner$\nAllow: /pricing$\nDisallow: /docs/*/edit\nDisallow: /blog/*/edit\nDisallow: /\nSitemap: ${url.origin}/sitemap.xml\n`
		: `# Not production: nothing here is for search engines.\nUser-agent: *\nDisallow: /\n`;
	return new Response(body, {
		headers: {
			"content-type": "text/plain; charset=utf-8",
			"cache-control": "public, max-age=3600",
		},
	});
};
