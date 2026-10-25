import { notify } from "#lib/state/notifications.svelte.js";
import type { ShortLinkKind } from "#lib/val/ShortLinkSchema.js";
import { shortenShareLink } from "./shortenShareLink";

/**
 * Copies a page's link in its short form (shvl.me in production; docs/security.md
 * "Short links"): the long address goes for a code, the short address lands on
 * the clipboard, and a notification says so. The long address is copied when no
 * code can be had, so the copy never fails for want of one; only a clipboard
 * refusal is an error. Answers whether anything was copied.
 */
export async function copyShortLink(longUrl: string, kind: ShortLinkKind): Promise<boolean> {
	const url = await shortenShareLink(longUrl, kind);
	try {
		await navigator.clipboard.writeText(url);
		notify(url === longUrl ? "Link copied" : "Short link copied");
		return true;
	} catch {
		notify("Could not copy the link", { kind: "error" });
		return false;
	}
}
