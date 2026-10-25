import * as v from "valibot";
import { ShortLinkAddressSchema } from "../val/ShortLinkSchema";

/**
 * Whether a request arrived on the short domain (`SHORT_LINK_ORIGIN`, with
 * or without `www.`, any port), and if so which address it carries:
 * `/<code>` or `/<slug>`, and the same under `/x/` (any case: the app's own
 * fallback form, pasted onto the short domain); any other path, a malformed
 * address or a reserved word included, is `null`, for the hook to send home. Null altogether for every other host, when no short
 * domain is configured, and when the short domain is the site itself (a
 * misconfiguration that would otherwise swallow every page).
 */
export function shortLinkHostRoute(
	url: URL,
	shortOrigin: string | undefined,
	canonicalOrigin: string,
): { code: string | null } | null {
	if (!shortOrigin) return null;
	let shortHost: string;
	let canonicalHost: string;
	try {
		shortHost = bare(new URL(shortOrigin).host);
		canonicalHost = bare(new URL(canonicalOrigin).host);
	} catch {
		return null;
	}
	if (shortHost === canonicalHost || bare(url.host) !== shortHost) return null;
	const segment = url.pathname.replace(/\/+$/, "").slice(1).replace(/^x\//i, "");
	return { code: v.is(ShortLinkAddressSchema, segment) ? segment : null };
}

function bare(host: string): string {
	return host
		.toLowerCase()
		.replace(/:\d+$/, "")
		.replace(/^www\./, "");
}
