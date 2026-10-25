interface RobotsRule {
	allow: boolean;
	pattern: string;
}

/**
 * Whether robots.txt lets a crawler fetch a path, the way Google documents
 * it: the `User-agent: *` group's Allow and Disallow lines are matched from
 * the start of the path, `*` matches any run of characters and a trailing
 * `$` anchors the end; the longest matching rule wins, an Allow wins a tie,
 * and a path no rule matches (or a file with no `*` group) is allowed.
 * Used by scripts/seo-audit.ts.
 */
export function robotsTxtAllows(robotsTxt: string, path: string): boolean {
	const best = starRules(robotsTxt)
		.filter((rule) => ruleRegExp(rule.pattern).test(path))
		.reduce<RobotsRule | undefined>((a, b) => (a && outranks(a, b) ? a : b), undefined);
	return best?.allow ?? true;
}

/** Whether rule a beats rule b: longer, or as long and an Allow. */
const outranks = (a: RobotsRule, b: RobotsRule) =>
	a.pattern.length > b.pattern.length || (a.pattern.length === b.pattern.length && a.allow);

/** A rule's path pattern as an anchored RegExp: `*` any run, a trailing `$` the end. */
function ruleRegExp(pattern: string) {
	const anchored = pattern.endsWith("$");
	const source = (anchored ? pattern.slice(0, -1) : pattern)
		.split("*")
		.map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
		.join(".*");
	return new RegExp(`^${source}${anchored ? "$" : ""}`);
}

/** The Allow and Disallow lines of the groups that name `*` (consecutive User-agent lines share a group). */
function starRules(robotsTxt: string): RobotsRule[] {
	const rules: RobotsRule[] = [];
	let inStar = false;
	let lastWasAgent = false;
	for (const [field, value] of robotsTxt.split(/\r?\n/).map(robotsLine)) {
		const agent = field === "user-agent";
		if (agent) inStar = (lastWasAgent && inStar) || value === "*";
		lastWasAgent = agent;
		if (inStar && (field === "allow" || field === "disallow") && value)
			rules.push({ allow: field === "allow", pattern: value });
	}
	return rules;
}

/** One line as [field (lower-cased), value], comments stripped; ["", ""] for anything else. */
function robotsLine(raw: string): [string, string] {
	const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(raw.replace(/#.*/, "").trim());
	return m ? [m[1].toLowerCase(), m[2].trim()] : ["", ""];
}
