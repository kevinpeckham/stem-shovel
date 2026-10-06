import { isSafeShortTarget } from "./isSafeShortTarget";

/**
 * The part of a share link a short link stores: its path, query and hash,
 * when the link is on `origin` (a relative address resolves against it and
 * counts); null for any other origin, or anything that is not a safe path
 * (`isSafeShortTarget`). A minted short link can only ever send a visitor
 * back to this site.
 */
export function shortLinkTarget(url: string | URL, origin: string): string | null {
	let parsed: URL;
	let base: URL;
	try {
		base = new URL(origin);
		parsed = new URL(url, base);
	} catch {
		return null;
	}
	if (parsed.origin !== base.origin) return null;
	const target = `${parsed.pathname}${parsed.search}${parsed.hash}`;
	return isSafeShortTarget(target) ? target : null;
}
