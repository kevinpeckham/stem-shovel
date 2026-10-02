import { getUserDoc } from "$lib/server/data";
import { renderMarkdown } from "$lib/server/markdown";
import { splitPageCopy } from "$lib/utils/splitPageCopy";

export interface PageCopy {
	title: string;
	intro: string;
	/** The rest of the doc as HTML (the tips under the device), or "" without any. */
	bodyHtml: string;
	/** A system admin edits the doc in the app, as the releases page. */
	canEdit: boolean;
	editHref: string;
}

/**
 * A page's own words from its "copy" user doc (docs/page-copy.md):
 * title, intro and the body under the device, with `fallback` (the
 * markdown the seed script would make the doc from) standing in until the
 * doc exists. The page passes the result to PageCopyHeader and
 * PageCopySection.
 */
export async function pageCopy(
	slug: string,
	fallback: string,
	locals: App.Locals,
): Promise<PageCopy> {
	const doc = await getUserDoc(slug);
	const source = doc?.kind === "copy" ? doc.markdown : fallback;
	const { title, intro, rest } = splitPageCopy(source);
	return {
		title,
		intro,
		bodyHtml: rest ? renderMarkdown(rest) : "",
		canEdit: !!locals.user?.isSystemAdmin,
		editHref: `/docs/${slug}/edit`,
	};
}
