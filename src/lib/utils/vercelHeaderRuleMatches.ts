/** One entry of vercel.json's `headers` array. */
export interface VercelHeaderRule {
	source: string;
	headers: { key: string; value: string }[];
}

/**
 * Whether the vercel.json header rule that sets `key` (X-Robots-Tag by
 * default) applies to a path. The rule's `source` is path-to-regexp style:
 * a parenthesized group is a raw regular expression (the noindex rule's
 * `/((?!docs|…).+)`), `:name*` is any rest of the path and `:name` one
 * segment; the whole source must match the whole path. No such rule: false.
 * Used by scripts/seo-audit.ts.
 */
export function vercelHeaderRuleMatches(
	rules: VercelHeaderRule[],
	path: string,
	key = "X-Robots-Tag",
): boolean {
	const rule = rules.find((r) => r.headers.some((h) => h.key.toLowerCase() === key.toLowerCase()));
	if (!rule) return false;
	const source = rule.source.replace(/:[A-Za-z_]\w*\*/g, ".*").replace(/:[A-Za-z_]\w*/g, "[^/]+");
	return new RegExp(`^${source}$`).test(path);
}
