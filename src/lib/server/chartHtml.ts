import { renderChart } from "@barmark/render";
import { chartRehearsalLetters } from "#lib/utils/chartRehearsalLetters.js";
import { renderScoreHtml } from "@barmark/score/server";
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
 * registered once per page by src/app.html's `<style data-barmark-font>`,
 * because a browser ignores @font-face inside a shadow root (and the element
 * leaves a page's own registration alone). Drawn the way barmark.dev does:
 * the dark palette with rehearsal letters unless the chart writes its own
 * marks (`chartRehearsalLetters`), carried as attributes
 * (`theme="dark" rehearsal-letters`) so the element keeps them when it loads. "" for a blank
 * chart.
 */
export function renderChartHtml(markdown: string): string {
	if (!markdown.trim()) return "";
	return renderChart(markdown, {
		theme: "dark",
		rehearsalLetters: chartRehearsalLetters(markdown),
	});
}

/**
 * The song's own chord chart with a Grid / Score switch: `<barmark-score>`
 * from `@barmark/score`, drawn on the server as the same grid
 * `renderChartHtml` draws (the dark palette with rehearsal letters) plus the
 * switch, all in the declarative shadow root, so the grid shows before any
 * script runs. The switch engraves the full score on demand once the element
 * upgrades in the browser (`ChartHtml.svelte` imports the element module):
 * Verovio (about 7 MB) loads only on the first switch to the score, in the
 * package's own Web Worker, and one worker serves every score on the page.
 * Every other chart (drafts, history revisions, score reads, the set-list
 * show page) stays the plain grid of `renderChartHtml`. "" for a blank chart.
 */
export function renderScoreChartHtml(markdown: string): string {
	if (!markdown.trim()) return "";
	return renderScoreHtml(markdown, {
		theme: "dark",
		rehearsalLetters: chartRehearsalLetters(markdown),
	});
}

/** A song document's HTML: the chart as a grid with its score switch, the others through renderMarkdown. */
export function renderDocHtml(kind: string, markdown: string): string {
	return kind === "chart" ? renderScoreChartHtml(markdown) : renderMarkdown(markdown);
}
