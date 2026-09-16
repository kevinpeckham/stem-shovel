import { requireSystemAdmin } from "$lib/server/access";
import { getUserDoc } from "$lib/server/data";
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/** The editor for one documentation page; system admins only. */
export const load: PageServerLoad = async ({ params, locals }) => {
	requireSystemAdmin(locals);
	const doc = await getUserDoc(params.slug);
	if (!doc) error(404, `No page "${params.slug}"`);
	return {
		doc: { id: doc.id, slug: doc.slug, title: doc.title },
		markdown: doc.markdown,
		version: doc.version,
	};
};
