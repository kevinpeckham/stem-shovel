import { getUserDoc, listUserDocs } from "$lib/server/data";
import { renderMarkdown } from "$lib/server/markdown";
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/** One documentation page, rendered; public. */
export const load: PageServerLoad = async ({ params, locals }) => {
	const doc = await getUserDoc(params.slug);
	if (!doc) error(404, `No page "${params.slug}"`);
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
		docs: await listUserDocs(),
		canEdit: !!locals.user?.isSystemAdmin,
	};
};
