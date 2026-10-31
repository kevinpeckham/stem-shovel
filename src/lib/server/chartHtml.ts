import { renderChart } from "@barmark/render";
import { parseChart } from "barmark";
import { renderMarkdown } from "./markdown.js";

/**
 * The chord chart drawn by barmark's renderer (docs/barmark-adoption-plan.md,
 * Scope 3): a `<barmark-chart>` holding a declarative shadow root with its
 * styles inside, so the page's CSS and the chart's keep out of each other's
 * way (`ChartHtml.svelte` puts it in the page). The renderer escapes every
 * text it draws (headings, chords, text lines, spoken labels), so the result
 * is not passed through sanitizeHtml, which would drop the <template> and
 * <style> a shadow root is made of. Its diagnostics stay off: the readout
 * under the chart lists them. The font (Edwin, static/fonts/barmark) is
 * registered once per page by uno.config.ts's preflight, because a browser
 * ignores @font-face inside a shadow root. Transitional: a chart barmark
 * reads no bars from (the old notation, until it is migrated) renders as
 * markdown, as before. "" for a blank chart.
 */
export function renderChartHtml(markdown: string): string {
	if (!markdown.trim()) return "";
	if (parseChart(markdown).bars.length === 0) return renderMarkdown(markdown);
	return renderChart(markdown, { theme: "dark" });
}

/** A song document's HTML: the chart through the renderer, the others through renderMarkdown. */
export function renderDocHtml(kind: string, markdown: string): string {
	return kind === "chart" ? renderChartHtml(markdown) : renderMarkdown(markdown);
}
