import { getUserDoc, listUserDocs } from "$lib/server/data";
import { renderMarkdown } from "$lib/server/markdown";
import { excerpt } from "$lib/utils/excerpt";
import { RELEASES_DOC_SLUG } from "$lib/constants/releasesDoc";
import { error, redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/** One documentation page, rendered; public. */
export const load: PageServerLoad = async ({ params, locals }) => {
	if (params.slug === RELEASES_DOC_SLUG) redirect(307, "/releases"); // its own page
	const doc = await getUserDoc(params.slug);
	if (!doc || doc.kind !== "doc") error(404, `No page "${params.slug}"`);
	return {
		doc: {
			id: doc.id,
			slug: doc.slug,
			title: doc.title,
			sortOrder: doc.sortOrder,
			version: doc.version,
			updatedAt: doc.updatedAt,
			editor: doc.editor?.name ?? null,
		},
		html: renderMarkdown(doc.markdown),
		/** The first paragraph, for the meta description search engines show. */
		description: excerpt(doc.markdown),
		docs: await listUserDocs(),
		canEdit: !!locals.user?.isSystemAdmin,
	};
};
