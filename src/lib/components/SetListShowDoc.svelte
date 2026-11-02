<script lang="ts">
	/**
	 * A song's chart or lyrics opened in a set list's show view
	 * (docs/band-plan.md, "Set list"): tabs between the two when the song
	 * has both. The HTML is rendered on the server: the chart by barmark
	 * (renderChartHtml, shown through ChartHtml), the lyrics sanitized
	 * markdown (renderMarkdown). On the chart, the song page's chord
	 * spelling and Key menus: viewing choices, shared with the song page
	 * in this browser (the spelling for every chart, the key per song).
	 */
	import { onMount } from "svelte";
	import ChartHtml from "#lib/components/ChartHtml.svelte";
	import ContextMenu from "#lib/components/ContextMenu.svelte";
	import { ChartKeyChoice } from "#lib/state/chartKey.svelte.js";
	import { ChordDialectChoice } from "#lib/state/chordDialect.svelte.js";

	interface Props {
		title: string;
		/** The song, whose remembered key the Key menu reads; null hides that menu. */
		songId: string | null;
		/** The chart text the menus redraw from. */
		chartMarkdown: string | null;
		chartHtml: string | null;
		lyricsHtml: string | null;
	}
	let { title, songId, chartMarkdown, chartHtml, lyricsHtml }: Props = $props();

	type Tab = "chart" | "lyrics";
	const TABS: [Tab, string][] = [
		["chart", "Chart"],
		["lyrics", "Lyrics"],
	];
	let picked = $state<Tab | null>(null);
	const tab = $derived<Tab>(picked ?? (chartHtml ? "chart" : "lyrics"));
	const html = $derived((tab === "chart" ? chartHtml : lyricsHtml) ?? "");
	const both = $derived(!!chartHtml && !!lyricsHtml);
	const menus = $derived(tab === "chart" && !!chartMarkdown);

	const spelling = new ChordDialectChoice();
	// The row remounts this view on each open, so the song is fixed for its life.
	// svelte-ignore state_referenced_locally
	const key = songId ? new ChartKeyChoice(songId) : null;
	const chartText = $derived(key && chartMarkdown ? key.text(chartMarkdown) : null);

	onMount(() => {
		spelling.load();
		key?.load();
	});

	const MENU_BUTTON =
		"inline-flex items-center gap-1 rounded border border-white/40 px-3 py-1 text-16px cursor-pointer";
</script>

<!-- The Chart / Lyrics tabs, when the song has both. -->
{#snippet tabs()}
	<div class="flex gap-2" role="tablist" aria-label="{title} views">
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
{/snippet}

<!-- The chord spelling and Key menus over the chart, as on the song page's Chords view. -->
{#snippet chartMenus(markdown: string)}
	<div class="ml-auto flex gap-2">
		<ContextMenu
			ariaLabel="Chord spelling: {spelling.short}"
			title="Chord spelling"
			buttonBaseClasses={MENU_BUTTON}
			iconClass="i-ph-list-numbers"
			label={spelling.short}
			items={spelling.items}
		/>
		{#if key}
			<ContextMenu
				ariaLabel="Key: {key.label(markdown)}"
				title="Key: the chart drawn in another key (a viewing choice; the chart itself does not change)"
				buttonBaseClasses={MENU_BUTTON}
				iconClass="i-ph-music-note"
				label={key.label(markdown)}
				items={key.items(markdown)}
			/>
		{/if}
	</div>
{/snippet}

<div class="mt-3 pl-14">
	{#if both || menus}
		<div class="mb-3 flex flex-wrap items-center gap-2 print:hidden">
			{#if both}{@render tabs()}{/if}
			{#if menus && chartMarkdown}{@render chartMenus(chartMarkdown)}{/if}
		</div>
	{/if}
	<div class="chart-body text-18px">
		{#if tab === "chart"}<ChartHtml
				{html}
				markdown={chartMarkdown ?? undefined}
				numerals={spelling.numerals}
				text={chartText}
			/>{:else}{@html html}{/if}
	</div>
</div>
