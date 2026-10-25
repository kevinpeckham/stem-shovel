/**
 * Every `$effect` call in a Svelte component or module, with the rationale
 * the house rule asks for: the line before it is a `// why $effect: …`
 * comment saying which real side effect the effect is (a canvas, an
 * external engine or library, a timer, the popover API). An effect without
 * one is unexplained, which `bun run audit:effects` and the test beside
 * this file report (docs/testing.md "The $effect audit"). The comment is
 * ours, not Fallow's next-line suppression: Fallow 3.34 places a Svelte
 * file's `$effect` findings on the wrong line, so its suppressions never
 * match there (FINDINGS.md).
 */
export interface EffectCallSite {
	/** 1-based line of the call. */
	line: number;
	callee: "$effect" | "$effect.pre" | "$effect.root";
	/** The reason from the suppression comment on the line before, or null. */
	rationale: string | null;
}

const CALL = /^\s*(\$effect(?:\.pre|\.root)?)\(/;
/** The rationale comment: `// why $effect: <which side effect>`, alone on the line before the call. */
export const EFFECT_RATIONALE_PREFIX = "// why $effect:";
const RATIONALE = /^\s*\/\/ why \$effect:\s*(.+?)\s*$/;

/** The `$effect` calls in `source`, in order. Only calls that start a statement count: a mention in a comment or a string does not. */
export function effectCallSites(source: string): EffectCallSite[] {
	const lines = source.split("\n");
	const sites: EffectCallSite[] = [];
	for (let i = 0; i < lines.length; i++) {
		const m = CALL.exec(lines[i]);
		if (!m) continue;
		const before = i > 0 ? RATIONALE.exec(lines[i - 1]) : null;
		sites.push({
			line: i + 1,
			callee: m[1] as EffectCallSite["callee"],
			rationale: before?.[1] || null,
		});
	}
	return sites;
}
