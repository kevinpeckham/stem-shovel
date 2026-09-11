import { toDom } from "@kevinpeckham/barkdown";
import DOMPurify from "isomorphic-dompurify";

/**
 * Markdown → sanitized HTML for read-only views. Uses barkdown's renderer
 * (marked GFM + footnotes), the same one the editor seeds itself with, so
 * what you see on the song page is what you edited. DOMPurify's html
 * profile plus the footnote attributes, mirroring woof-editor's default.
 */
export function renderMarkdown(markdown: string): string {
	if (!markdown.trim()) return "";
	return DOMPurify.sanitize(toDom(markdown), {
		USE_PROFILES: { html: true },
		ADD_ATTR: ["data-footnote-ref", "data-footnotes", "id"],
	});
}

export async function hashMarkdown(markdown: string): Promise<string> {
	const bytes = new TextEncoder().encode(markdown);
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
