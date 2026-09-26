import { indexableStage } from "$lib/constants/securityHeaders";
import { listBlogPosts, listUserDocs } from "$lib/server/data";
import type { RequestHandler } from "./$types";
import { ENV } from "varlock/env";

export const prerender = false;

/**
 * What search engines may index (src/lib/utils/isIndexablePath.ts): the
 * front page, the docs list, every doc page with when it last changed, and
 * the Releases page. Off production the sitemap is empty, like robots.txt.
 */
export const GET: RequestHandler = async ({ url }) => {
	const entries: string[] = [];
	if (indexableStage(ENV.VERCEL_ENV)) {
		const docs = await listUserDocs();
		const posts = await listBlogPosts();
		entries.push(
			entry(url.origin, "/", "monthly"),
			entry(url.origin, "/docs", "weekly"),
			...docs.map((d) => entry(url.origin, `/docs/${d.slug}`, "monthly", d.updatedAt)),
			entry(url.origin, "/releases", "weekly"),
			entry(url.origin, "/tuner", "monthly"),
			entry(url.origin, "/metronome", "monthly"),
			entry(url.origin, "/drum-machine", "monthly"),
			entry(url.origin, "/pricing", "monthly"),
			entry(url.origin, "/built-with", "monthly"),
			entry(url.origin, "/blog", "weekly"),
			...posts.map((p) => entry(url.origin, `/blog/${p.slug}`, "monthly", p.updatedAt)),
		);
	}
	const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`;
	return new Response(body, {
		headers: {
			"content-type": "application/xml; charset=utf-8",
			"cache-control": "public, max-age=3600",
		},
	});
};

/** One <url>; the origin is the request's own, which on production is the canonical www host (other names redirect to it). */
function entry(origin: string, path: string, changefreq: string, lastmod?: Date) {
	const mod = lastmod ? `\n\t\t<lastmod>${lastmod.toISOString().slice(0, 10)}</lastmod>` : "";
	return `\t<url>\n\t\t<loc>${origin}${path}</loc>${mod}\n\t\t<changefreq>${changefreq}</changefreq>\n\t</url>`;
}
