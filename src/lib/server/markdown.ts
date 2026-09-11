import { toDom } from "@kevinpeckham/barkdown";
import sanitizeHtml from "sanitize-html";

/**
 * Markdown → sanitized HTML for read-only views. barkdown's renderer (marked
 * GFM + footnotes) is what the editor seeds itself with, so the song page
 * shows what was edited.
 *
 * Sanitization is sanitize-html, not DOMPurify: DOMPurify's server build
 * needs jsdom, whose current encoding sniffer is ESM-only and cannot be
 * `require()`d by Vercel's function runtime (ERR_REQUIRE_ESM at cold start,
 * which took every route down). The allowlist mirrors DOMPurify's html
 * profile for the tags marked emits, plus marked-footnote's attributes.
 */
const OPTIONS: sanitizeHtml.IOptions = {
	allowedTags: [
		...sanitizeHtml.defaults.allowedTags,
		"img",
		"h1",
		"h2",
		"del",
		"ins",
		"input",
		"sup",
		"sub",
		"section",
	],
	allowedAttributes: {
		"*": ["id", "class", "data-footnote-ref", "data-footnotes", "data-footnote-backref"],
		a: ["href", "name", "target", "rel", "title"],
		img: ["src", "alt", "title", "width", "height"],
		input: ["type", "checked", "disabled"], // GFM task lists
		td: ["align"],
		th: ["align"],
	},
	// Footnote refs point at #footnote-N on the same page; keep those.
	allowedSchemes: ["http", "https", "mailto", "tel"],
	allowProtocolRelative: false,
};

export function renderMarkdown(markdown: string): string {
	if (!markdown.trim()) return "";
	return sanitizeHtml(toDom(markdown), OPTIONS);
}

export async function hashMarkdown(markdown: string): Promise<string> {
	const bytes = new TextEncoder().encode(markdown);
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
