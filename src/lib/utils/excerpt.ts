/**
 * The first paragraph of a markdown document as plain text, cut to `max`
 * characters at a word: a meta description for a page search engines index.
 */
export function excerpt(markdown: string, max = 160): string {
	const paragraph = markdown
		.replace(/\r\n/g, "\n")
		.split(/\n\s*\n/)
		.map((p) => p.trim())
		.find((p) => p && !p.startsWith("#") && !p.startsWith("|") && !p.startsWith("```"));
	if (!paragraph) return "";
	const text = paragraph
		.replace(/!\[[^\]]*\]\([^)]*\)/g, "")
		.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/[*_`>#]+/g, "")
		.replace(/\s+/g, " ")
		.trim();
	if (text.length <= max) return text;
	const cut = text.slice(0, max + 1);
	return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:]$/, "")}…`;
}
