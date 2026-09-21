import { requireSystemAdmin } from "$lib/server/access";
import { getUserDoc } from "$lib/server/data";
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/** The editor for one blog post; system admins only. */
export const load: PageServerLoad = async ({ params, locals }) => {
	requireSystemAdmin(locals);
	const post = await getUserDoc(params.slug);
	if (!post || post.kind !== "post") error(404, `No post "${params.slug}"`);
	return {
		post: { id: post.id, slug: post.slug, title: post.title, published: !!post.publishedAt },
		markdown: post.markdown,
		version: post.version,
	};
};
