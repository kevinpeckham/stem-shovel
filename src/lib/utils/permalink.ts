/**
 * A permanent, id-based address for something whose pretty URL can change
 * with a rename: `/go/<kind>/<id>[/<rest>]`, answered by
 * src/routes/go/[kind]/[id]/[...rest] with a redirect to the current page.
 * Stored links (notifications, digest emails) use it, so a rename never
 * strands them, and a slug reused by a new item never captures them.
 */
export const PERMALINK_KINDS = ["song", "project", "account"] as const;
export type PermalinkKind = (typeof PERMALINK_KINDS)[number];

export function permalink(kind: PermalinkKind, id: string, rest = ""): string {
	const tail = rest.replace(/^\/+/, "");
	return `/go/${kind}/${encodeURIComponent(id)}${tail ? `/${tail}` : ""}`;
}
