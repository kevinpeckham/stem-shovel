<script lang="ts">
	/**
	 * A song's chart or lyrics opened in a set list's show view
	 * (docs/band-plan.md, "Set list"): tabs between the two when the song
	 * has both. The HTML is rendered on the server: the chart by barmark
	 * (renderChartHtml, shown through ChartHtml), the lyrics sanitized
	 * markdown (renderMarkdown).
	 */
	import ChartHtml from "#lib/components/ChartHtml.svelte";

	interface Props {
		title: string;
		chartHtml: string | null;
		lyricsHtml: string | null;
	}
	let { title, chartHtml, lyricsHtml }: Props = $props();

	type Tab = "chart" | "lyrics";
	const TABS: [Tab, string][] = [
		["chart", "Chart"],
		["lyrics", "Lyrics"],
	];
	let picked = $state<Tab | null>(null);
	const tab = $derived<Tab>(picked ?? (chartHtml ? "chart" : "lyrics"));
	const html = $derived((tab === "chart" ? chartHtml : lyricsHtml) ?? "");
	const both = $derived(!!chartHtml && !!lyricsHtml);
</script>

<div class="mt-3 pl-14">
	{#if both}
		<div class="mb-3 flex gap-2 print:hidden" role="tablist" aria-label="{title} views">
			{#each TABS as [k, label] (k)}
				<button
					class="rounded px-3 py-1 text-16px {tab === k
						? 'bg-white text-black'
						: 'border border-white/40'}"
					type="button"
					role="tab"
					aria-selected={tab === k}
					onclick={() => (picked = k)}>{label}</button
				>
			{/each}
		</div>
	{/if}
	<div class="chart-body text-18px">
		{#if tab === "chart"}<ChartHtml {html} />{:else}{@html html}{/if}
	</div>
</div>
