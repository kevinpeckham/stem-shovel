<script lang="ts">
	import SetListShowDoc from "./SetListShowDoc.svelte";

	/**
	 * One row of a set list's show view (docs/band-plan.md, "Set list"): its
	 * number, title and note in big type; a tap opens the song's chart or
	 * lyrics in place when the viewer may read them, a second tap closes it.
	 */
	interface Props {
		row: {
			id: string;
			title: string;
			note: string;
			chartHtml: string | null;
			lyricsHtml: string | null;
		};
		number: number;
	}
	let { row, number }: Props = $props();

	let open = $state(false);
	const opens = $derived(!!(row.chartHtml || row.lyricsHtml));
</script>

<li
	class="border-b border-white/25 py-3 print:break-inside-avoid print:border-black/30 print:py-1.5"
>
	<button
		class="flex w-full items-baseline gap-4 text-left enabled:hover:text-accent"
		type="button"
		aria-expanded={opens ? open : undefined}
		disabled={!opens}
		onclick={() => (open = !open)}
	>
		<span class="w-10 shrink-0 text-right text-28px font-700 tabular-nums opacity-60">{number}</span
		>
		<span class="min-w-0 flex-1">
			<span class="block text-28px font-700 leading-tight sm:text-34px">{row.title}</span>
			{#if row.note}
				<span class="mt-1 block text-18px opacity-80 sm:text-20px">{row.note}</span>
			{/if}
		</span>
		{#if opens}
			<span
				class="shrink-0 text-24px opacity-60 print:hidden {open
					? 'i-ph-caret-up'
					: 'i-ph-caret-down'}"
				aria-hidden="true"
			></span>
		{/if}
	</button>
	{#if open}
		<SetListShowDoc title={row.title} chartHtml={row.chartHtml} lyricsHtml={row.lyricsHtml} />
	{/if}
</li>
