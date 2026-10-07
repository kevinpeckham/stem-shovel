/**
 * A line of markdown as plain text: links keep their text, emphasis and
 * code marks go, so a page's intro can be read aloud by a tooltip or a
 * title where no HTML renders (docs/page-copy.md). Block syntax is not
 * handled: an intro is a sentence or two.
 */
export function stripMarkdownInline(markdown: string): string {
	return markdown
		.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
		.replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1")
		.replace(/`([^`]+)`/g, "$1")
		.replace(/(\*\*|__)(.+?)\1/g, "$2")
		.replace(/(\*|_)(.+?)\1/g, "$2")
		.replace(/\s+/g, " ")
		.trim();
}
