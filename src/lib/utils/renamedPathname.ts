/**
 * The path a page lives at after its account, project or song was renamed:
 * `/<account>/projects/<project>/<song>/…` with the stale segments replaced
 * by the current slugs. Returns null when nothing changes, which is what
 * keeps a redirect from pointing at itself: a slug that is live again (a
 * rename reverted) resolves directly and never reaches the alias, and an
 * alias that somehow names the slug the page already has is ignored rather
 * than followed in a circle (src/lib/server/slugAlias.ts).
 */
export function renamedPathname(
	pathname: string,
	current: { account?: string; project?: string; song?: string },
): string | null {
	const segments = pathname.split("/");
	// ["", account, "projects", project, song, …]
	if (current.account && segments.length > 1) segments[1] = current.account;
	if (current.project && segments[2] === "projects" && segments.length > 3) {
		segments[3] = current.project;
	}
	if (current.song && segments[2] === "projects" && segments.length > 4) {
		segments[4] = current.song;
	}
	const next = segments.join("/");
	return next === pathname ? null : next;
}
