import { getUserDoc } from "$lib/server/data";
import { renderMarkdown } from "$lib/server/markdown";
import { excerpt } from "$lib/utils/excerpt";
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/** One blog post, rendered; public once published, a draft only for system admins. */
export const load: PageServerLoad = async ({ params, locals }) => {
	const canEdit = !!locals.user?.isSystemAdmin;
	const post = await getUserDoc(params.slug);
	if (!post || post.kind !== "post" || (!post.publishedAt && !canEdit))
		error(404, `No post "${params.slug}"`);
	return {
		post: {
			id: post.id,
			slug: post.slug,
			title: post.title,
			publishedAt: post.publishedAt,
			version: post.version,
			updatedAt: post.updatedAt,
			author: post.editor?.name ?? null,
		},
		html: renderMarkdown(post.markdown),
		/** The first paragraph, for the meta description search engines show. */
		description: excerpt(post.markdown),
		canEdit,
	};
};
