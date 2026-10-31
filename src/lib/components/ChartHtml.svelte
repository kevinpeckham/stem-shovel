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
	 */
	interface Props {
		html: string;
	}
	let { html }: Props = $props();

	const adoptShadow = (html: string) => (node: HTMLElement) => {
		void tick().then(() => {
			const chart = node.querySelector("barmark-chart");
			if (chart && !chart.shadowRoot && "setHTMLUnsafe" in node) node.setHTMLUnsafe(html);
		});
	};
</script>

{#key html}
	<!-- The chart's paper is the panel's: the renderer's palette reads these from its host. -->
	<div class="contents [--barmark-paper:transparent]" {@attach adoptShadow(html)}>
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- renderChartHtml escapes what it draws; renderMarkdown is sanitized -->
		{@html html}
	</div>
{/key}
