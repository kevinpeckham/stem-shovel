<script lang="ts">
	import { tick } from "svelte";

	/**
	 * A chord chart's rendered HTML in the page: barmark's `<barmark-chart>`
	 * with its declarative shadow root (`renderChartHtml`), or the old
	 * typography while the chart is not yet barmark (then the HTML is
	 * renderMarkdown's, and the wrapper's `chart-body` styles it). Svelte
	 * inserts `{@html}` through innerHTML, which leaves a declarative shadow
	 * root's <template> inert, so once the nodes are in the document the
	 * chart is parsed again with setHTMLUnsafe unless it has its shadow root
	 * already (the page's own HTML, parsed by the browser). `{#key}` remounts
	 * on new HTML, so that re-parse never fights the block's own update.
	 *
	 * With `numerals` (the Chords view's Nashville or Roman spelling) the
	 * element module loads and the chart is handed its `markdown` as `text`:
	 * a server-drawn chart has no text of its own, so a `numerals` attribute
	 * alone would only restyle it. Back to null after that, the element
	 * redraws from the same text with chord names. `text` (the Key menu's
	 * transposition) is drawn in place of `markdown` the same way. Never set,
	 * nothing loads and the server's HTML stays as it is.
	 */
	interface Props {
		html: string;
		/** The chart text, which the element redraws from when spelled as numerals. */
		markdown?: string;
		numerals?: "nashville" | "roman" | null;
		/** The chart to draw instead of `markdown`: the Key menu's transposition, null in the original key. */
		text?: string | null;
		/** The chart's background in place of the look's translucent paper (`--barmark-paper`): "transparent" on the home page's demo. */
		paper?: string | null;
	}
	let { html, markdown, numerals = null, text: textProp = null, paper = null }: Props = $props();

	type ChartElement = HTMLElement & { text: string | null; numerals: string | null };
	/** The element has been given text, so a return to names must be drawn too. */
	let drawn = false;

	const draw = (html: string) => (node: HTMLElement) => {
		const dialect = numerals;
		const moved = !!textProp && textProp !== markdown;
		const text = textProp ?? markdown ?? "";
		let live = true;
		void tick().then(async () => {
			const chart = node.querySelector("barmark-chart");
			if (chart && !chart.shadowRoot && "setHTMLUnsafe" in node) node.setHTMLUnsafe(html);
			if (!dialect && !moved && !drawn) return;
			await import("@barmark/render/element");
			// Queried again: the re-parse above replaced the element.
			const element = node.querySelector<ChartElement>("barmark-chart");
			if (!live || !element) return;
			element.numerals = dialect;
			element.text = text;
			drawn = true;
		});
		return () => {
			live = false;
		};
	};
</script>

{#key html}
	<!-- barmark.dev's chart look (uno.config.ts): the renderer's palette reads these custom properties from its host. -->
	<div class="barmark-look min-w-0" style:--barmark-paper={paper} {@attach draw(html)}>
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- renderChartHtml escapes what it draws; renderMarkdown is sanitized -->
		{@html html}
	</div>
{/key}
