import { mintShortLink } from "#lib/remote/shortLinks.remote.js";
import { shortLinkTarget } from "#lib/utils/shortLinkTarget.js";

/**
 * A share link made short (docs/security.md, "Short links"; Kevin: the
 * instruments' links are long): the long URL's path, query and hash go to
 * the server, which answers with a code on the short domain (shvl.me in
 * production, the app's own `/x/<code>` elsewhere). On any failure, a rate
 * limit, no network, the long URL itself comes back, so copying never
 * fails for want of a code.
 */
export async function shortenShareLink(
	longUrl: string,
	kind: "chord-player" | "drum-machine" | "piano" | "song" | "project" | "other",
): Promise<string> {
	try {
		const target = shortLinkTarget(longUrl, window.location.origin);
		if (!target) return longUrl;
		const { url } = await mintShortLink({ target, kind });
		return url || longUrl;
	} catch {
		return longUrl;
	}
}
