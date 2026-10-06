/**
 * The address a short link is handed out as: `<SHORT_LINK_ORIGIN>/<code>`
 * where the short domain is configured (production: https://shvl.me), else
 * `/x/<code>` on the app's own origin, which resolves the same codes
 * (docs/environment.md, "Short links").
 */
export function shortLinkUrl(
	code: string,
	shortOrigin: string | undefined,
	origin: string,
): string {
	const base = shortOrigin?.trim().replace(/\/+$/, "");
	return base ? `${base}/${code}` : `${origin.replace(/\/+$/, "")}/x/${code}`;
}
