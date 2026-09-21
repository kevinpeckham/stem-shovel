import { listBlogPosts } from "$lib/server/data";
import { excerpt } from "$lib/utils/excerpt";
import type { PageServerLoad } from "./$types";

/** The blog index: public; system admins also see the drafts and the writing controls. */
export const load: PageServerLoad = async ({ locals }) => {
	const canEdit = !!locals.user?.isSystemAdmin;
	const posts = await listBlogPosts(canEdit);
	return {
		posts: posts.map((p) => ({
			id: p.id,
			slug: p.slug,
			title: p.title,
			publishedAt: p.publishedAt,
			version: p.version,
			author: p.editor?.name ?? null,
			summary: excerpt(p.markdown, 220),
		})),
		canEdit,
	};
};
