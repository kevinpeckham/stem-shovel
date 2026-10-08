import { getUserDoc } from "#lib/server/data.js";
import { renderMarkdown } from "#lib/server/markdown.js";
import { splitPageCopy } from "#lib/utils/splitPageCopy.js";
import { stripMarkdownInline } from "#lib/utils/stripMarkdownInline.js";

export interface PageCopy {
	title: string;
	/** The intro as plain text (for a tooltip, a title). */
	intro: string;
	/** The intro rendered as inline HTML (links, emphasis), without a wrapping paragraph. */
	introHtml: string;
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
/** A paragraph's markdown as inline HTML: rendered and sanitized as the body is, the outer `<p>` taken off (Kevin: links in an intro showed as markdown). */
function inlineHtml(markdown: string): string {
	const html = renderMarkdown(markdown).trim();
	return html.replace(/^<p>/, "").replace(/<\/p>$/, "");
}

export async function pageCopy(
	slug: string,
	fallback: string,
	locals: App.Locals,
): Promise<PageCopy> {
	const doc = await getUserDoc(slug);
	const source = doc?.kind === "copy" ? doc.markdown : fallback;
	const { title, intro, rest } = splitPageCopy(source);
	return {
		title: stripMarkdownInline(title),
		intro: stripMarkdownInline(intro),
		introHtml: inlineHtml(intro),
		bodyHtml: rest ? renderMarkdown(rest) : "",
		canEdit: !!locals.user?.isSystemAdmin,
		editHref: `/docs/${slug}/edit`,
	};
}
