const EDITOR_ESCAPE = /\\([|*_[\]#])/g;

/**
 * A chart's markdown without the escapes the markdown editor writes when
 * it serializes one (`\|`, `\*`, `\_`, `\[`, `\]`, `\#`), which barmark
 * would read literally (docs/barmark-adoption-plan.md, Scope 2).
 */
export function unescapeChartMarkdown(text: string): string {
	return text.replace(EDITOR_ESCAPE, "$1");
}
