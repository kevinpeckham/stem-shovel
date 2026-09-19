import { RELEASES_DOC_SLUG } from "$lib/constants/releasesDoc";
import { getUserDoc } from "$lib/server/data";
import { renderMarkdown } from "$lib/server/markdown";
import { parseChangelog } from "$lib/utils/parseChangelog";
import type { PageServerLoad } from "./$types";

/**
 * The releases page: the "releases" user doc (edited in the app like every
 * doc page, seeded once from scripts/user-docs/releases.md), split into one
 * section per version. Public; system admins get an Edit button.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const doc = await getUserDoc(RELEASES_DOC_SLUG);
	return {
		releases: doc
			? parseChangelog(doc.markdown).map((r) => ({
					version: r.version,
					date: r.date,
					html: renderMarkdown(r.body),
				}))
			: [],
		updatedAt: doc?.updatedAt ?? null,
		canEdit: !!locals.user?.isSystemAdmin,
	};
};
