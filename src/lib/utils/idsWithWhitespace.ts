/**
 * The ids in a page's markup that hold whitespace, each once, in order.
 * Such an id is invalid, and nothing can point at it: `aria-labelledby`,
 * `aria-describedby` and the like read their value as a space-separated
 * list of ids, so `"built-The app"` names two elements that do not exist
 * (issue #22: five unnamed regions on the Built With page). Reads tags
 * only, and nothing inside a script or a style.
 */
export function idsWithWhitespace(html: string): string[] {
	const markup = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "");
	const found = new Set<string>();
	for (const tag of markup.matchAll(/<[a-z][^>]*>/gi)) {
		const id = /\sid\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag[0]);
		const value = id?.[1] ?? id?.[2];
		if (value !== undefined && /\s/.test(value)) found.add(value);
	}
	return [...found];
}
