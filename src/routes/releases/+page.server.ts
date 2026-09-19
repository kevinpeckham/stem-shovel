import changelog from "../../../CHANGELOG.md?raw";
import { renderMarkdown } from "$lib/server/markdown";
import { parseChangelog } from "$lib/utils/parseChangelog";
import type { PageServerLoad } from "./$types";

/**
 * The releases page: CHANGELOG.md, one section per version, rendered from
 * the file bundled at build time (no database). The Technical subsections
 * stay in the file and off the page.
 */
export const load: PageServerLoad = () => ({
	releases: parseChangelog(changelog).map((r) => ({
		version: r.version,
		date: r.date,
		html: renderMarkdown(r.body),
	})),
});
