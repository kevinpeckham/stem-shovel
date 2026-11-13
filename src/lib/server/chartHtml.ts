import { renderChart } from "@barmark/render";
import { ENGRAVER_CDN_INTEGRITY, ENGRAVER_CDN_URL, ENGRAVER_WASM_INTEGRITY } from "@barmark/score";
import { renderScoreHtml } from "@barmark/score/server";
import type { ChartColumns } from "#lib/val/ChartColumnsSchema.js";
import { renderMarkdown } from "./markdown.js";

/** The song's own drawing choices: `columns` is its `song.chartColumns`. */
type ChartHtmlOptions = { columns?: ChartColumns };

/**
 * Only `row` is passed on, so a chart on the default (`shared`) draws exactly
 * as it did before the setting existed; the renderer writes it as
 * `columns="row"` on the element.
 */
function columnsOption(options: ChartHtmlOptions | undefined) {
	return options?.columns === "row" ? { columns: "row" as const } : {};
}

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
 * the light palette with rehearsal letters (the look's paper and ink, uno.config.ts) (`@barmark/render` 0.19 leaves
 * them off a chart that writes its own marks), carried as attributes
 * (`theme="light" rehearsal-letters`) so the element keeps them when it loads. "" for a blank
 * chart. `options.columns` is the song's column sizing (`ChartColumnsSchema`).
 */
export function renderChartHtml(markdown: string, options?: ChartHtmlOptions): string {
	if (!markdown.trim()) return "";
	return renderChart(markdown, {
		theme: "light",
		rehearsalLetters: true,
		...columnsOption(options),
	});
}

/**
 * The song's own chord chart with a Grid / Score switch: `<barmark-score>`
 * from `@barmark/score`, drawn on the server as the same grid
 * `renderChartHtml` draws (the dark palette with rehearsal letters) plus the
 * switch, all in the declarative shadow root, so the grid shows before any
 * script runs. The switch engraves the full score on demand once the element
 * upgrades in the browser (`ChartHtml.svelte` imports the element module):
 * the engraver (`@barmark/engraver`, about 3 MB; `ENGRAVER_ATTRIBUTES`)
 * loads only on the first switch to the score, in the package's own Web
 * Worker, and one worker serves every score on the page.
 * Every other chart (drafts, history revisions, score reads, the set-list
 * show page) stays the plain grid of `renderChartHtml`. "" for a blank chart.
 * `options.columns` is the song's column sizing, as for `renderChartHtml`.
 */
export function renderScoreChartHtml(markdown: string, options?: ChartHtmlOptions): string {
	if (!markdown.trim()) return "";
	const html = renderScoreHtml(markdown, {
		theme: "light",
		rehearsalLetters: true,
		...columnsOption(options),
	});
	return html.replace(/^<barmark-score\b/, `<barmark-score ${ENGRAVER_ATTRIBUTES}`);
}

/**
 * The engraver the score element loads: `@barmark/engraver`, barmark's build
 * of the same Verovio 6.4.1 at about 3 MB where stock is about 7 MB, served
 * from our own origin (`static/engraver/<version>/`, the copy `bun run
 * engraver` makes; the page's CSP allows no other) with both files' SRI
 * digests (the module's and the `.wasm` beside it) as `@barmark/score`'s
 * own constants spell them, so a copy from another version is refused. On
 * a digest mismatch or a failed download the element falls back to the
 * package's own copy, once, with a warning. `renderScoreHtml` writes its
 * options as attributes on the element but has none for these, so they
 * join its opening tag here.
 */
export const ENGRAVER_URL = `/engraver/${ENGRAVER_CDN_URL.match(/engraver@([\d.]+)\//)?.[1]}/verovio-module.mjs`;

const ENGRAVER_ATTRIBUTES = [
	`verovio-url="${ENGRAVER_URL}"`,
	`verovio-integrity="${ENGRAVER_CDN_INTEGRITY}"`,
	`verovio-wasm-integrity="${ENGRAVER_WASM_INTEGRITY}"`,
].join(" ");

/** A song document's HTML: the chart as a grid with its score switch, the others through renderMarkdown. */
export function renderDocHtml(kind: string, markdown: string): string {
	return kind === "chart" ? renderScoreChartHtml(markdown) : renderMarkdown(markdown);
}
