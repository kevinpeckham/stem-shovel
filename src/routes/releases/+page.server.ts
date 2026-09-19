import releases from "../../../RELEASES.md?raw";
import { renderMarkdown } from "$lib/server/markdown";
import { parseChangelog } from "$lib/utils/parseChangelog";
import type { PageServerLoad } from "./$types";

/**
 * The releases page: RELEASES.md, the user-facing notes (features, changes
 * and fixes a user would notice; CHANGELOG.md keeps the full record), one
 * section per version, rendered from the file bundled at build time.
 */
export const load: PageServerLoad = () => ({
	releases: parseChangelog(releases).map((r) => ({
		version: r.version,
		date: r.date,
		html: renderMarkdown(r.body),
	})),
});
