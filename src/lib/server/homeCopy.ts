import { getUserDoc } from "#lib/server/data.js";
import { inlineHtml } from "#lib/server/pageCopy.js";
import { splitHomeCopy, type HomeCopySection } from "#lib/utils/splitHomeCopy.js";
import { stripMarkdownInline } from "#lib/utils/stripMarkdownInline.js";

/** A section of the home page's words, rendered: the heading as text, the paragraphs as inline HTML. */
export interface HomeCopyBlock {
	heading: string;
	paragraphs: string[];
}
export interface HomeCopySectionHtml extends HomeCopyBlock {
	items: (HomeCopyBlock & { id: string })[];
}
export interface HomeCopyHtml {
	title: string;
	/** The page's description, as plain text, for the meta tags. */
	intro: string;
	/** By the section's id (`{#player}`, `{#faq}`…), each the doc's when it has one and the fallback's otherwise. */
	sections: Record<string, HomeCopySectionHtml>;
	canEdit: boolean;
	editHref: string;
}

function render(section: HomeCopySection): HomeCopySectionHtml {
	return {
		heading: stripMarkdownInline(section.heading),
		paragraphs: section.paragraphs.map(inlineHtml),
		items: section.items.map((i) => ({
			id: i.id,
			heading: stripMarkdownInline(i.heading),
			paragraphs: i.paragraphs.map(inlineHtml),
		})),
	};
}

/**
 * The home page's words from its "home-page" copy doc (docs/page-copy.md,
 * "The home page"), with `fallback` (scripts/user-docs/home-page.md)
 * standing in for the doc until it exists and for any section the doc
 * lacks, so an edit that drops a section's heading leaves the page whole.
 */
export async function homeCopy(fallback: string, locals: App.Locals): Promise<HomeCopyHtml> {
	const doc = await getUserDoc("home-page");
	const base = splitHomeCopy(fallback);
	const own = doc?.kind === "copy" ? splitHomeCopy(doc.markdown) : base;
	const sections: Record<string, HomeCopySectionHtml> = {};
	for (const s of [...base.sections, ...own.sections]) sections[s.id] = render(s);
	return {
		title: stripMarkdownInline(own.title || base.title),
		intro: stripMarkdownInline(own.intro || base.intro),
		sections,
		canEdit: !!locals.user?.isSystemAdmin,
		editHref: "/docs/home-page/edit",
	};
}
