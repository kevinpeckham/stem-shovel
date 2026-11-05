import { renderMarkdown } from "#lib/server/markdown.js";
import { parseChangelog } from "#lib/utils/parseChangelog.js";
import releasesMarkdown from "../../../RELEASES.md?raw";
import type { PageServerLoad } from "./$types";

/**
 * The releases page: RELEASES.md from the repository (the user-facing
 * notes a release writes beside CHANGELOG.md; bundled at build time, so a
 * deploy is the update), split into one section per version. Public. Until
 * 2026-11-05 the page was the "releases" user doc, pasted by hand on each
 * stage after every release.
 */
export const load: PageServerLoad = async () => ({
	releases: parseChangelog(releasesMarkdown).map((r) => ({
		version: r.version,
		date: r.date,
		html: renderMarkdown(r.body),
	})),
});
