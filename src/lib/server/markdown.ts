import { sanitizeHtml } from "$lib/server/sanitize";
import { toDom } from "@kevinpeckham/barkdown";

/**
 * Markdown → sanitized HTML for read-only views. barkdown's renderer (marked
 * GFM + footnotes) is what the editor seeds itself with, so the song page
 * shows what was edited. Sanitized by our own allowlist pass; see
 * sanitize.ts for why not DOMPurify or sanitize-html.
 */
export function renderMarkdown(markdown: string): string {
	if (!markdown.trim()) return "";
	return sanitizeHtml(toDom(markdown));
}

export async function hashMarkdown(markdown: string): Promise<string> {
	const bytes = new TextEncoder().encode(markdown);
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
