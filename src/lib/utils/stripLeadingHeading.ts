/**
 * Markdown without its opening `# Title` line (and the blank lines after
 * it), for a page that already shows the title as its own heading: two
 * `<h1>`s on one page is what the indexability audit flags (docs/security.md,
 * "Indexability audit"). Anything else, a document that opens with prose or
 * a lesser heading, comes back untouched.
 */
export function stripLeadingHeading(markdown: string): string {
	const m = /^\s*#[ \t]+[^\n]*\n+/.exec(markdown);
	return m ? markdown.slice(m[0].length) : markdown;
}
