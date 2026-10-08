import { requireSystemAdmin } from "#lib/server/access.js";
import { PAGE_COPY } from "#lib/constants/pageCopy.js";
import { getUserDoc } from "#lib/server/data.js";
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/** The editor for one documentation page; system admins only. */
export const load: PageServerLoad = async ({ params, locals }) => {
	requireSystemAdmin(locals);
	const doc = await getUserDoc(params.slug);
	// Docs and pages' copy docs (docs/page-copy.md) are edited here; a copy doc's Exit goes back to its page.
	if (!doc || (doc.kind !== "doc" && doc.kind !== "copy")) error(404, `No page "${params.slug}"`);
	const backHref = doc.kind === "copy" ? (PAGE_COPY[doc.slug] ?? "/") : `/docs/${doc.slug}`;
	return {
		doc: { id: doc.id, slug: doc.slug, title: doc.title },
		markdown: doc.markdown,
		version: doc.version,
		backHref,
	};
};
