import { SHORT_LINK_KIND_LABELS } from "#lib/constants/shortLinkKinds.js";
import type { ShortLinkKind } from "#lib/val/ShortLinkSchema.js";

/**
 * Where a short link goes, readably (/settings/links): the target's path
 * without its query and hash (an instrument's settings ride there, long
 * and unreadable), and for an instrument or a Studio song the name of the
 * thing; a song's or project's path names itself, so it has none.
 */
export function shortLinkDestination(
	target: string,
	kind: ShortLinkKind,
): { name: string | null; path: string } {
	const path = target.split(/[?#]/)[0] || "/";
	// An attachment's or score's permanent link (/f/<code>) is "other" to the minter; name it for the reader.
	if (kind === "other" && path.startsWith("/f/")) return { name: "File", path };
	const named = kind !== "song" && kind !== "project" && kind !== "other";
	return { name: named ? SHORT_LINK_KIND_LABELS[kind] : null, path };
}
