/**
 * Which paths search engines may index on production: the front page, the
 * user documentation and the blog (the list and each page, not the editors;
 * a draft post carries its own noindex), the Releases page, the tuner and
 * the pricing page. Everything else is a private app. Mirrored by
 * src/routes/robots.txt and vercel.json's X-Robots-Tag rule.
 */
export function isIndexablePath(pathname: string): boolean {
	if (["/", "/docs", "/blog", "/releases", "/tuner", "/pricing"].includes(pathname)) return true;
	return /^\/(docs|blog)\/[^/]+\/?$/.test(pathname);
}
