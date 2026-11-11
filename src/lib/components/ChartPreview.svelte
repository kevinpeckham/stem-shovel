<script lang="ts">
	import { onMount } from "svelte";
	import type { ChartColumns } from "#lib/val/ChartColumnsSchema.js";

	/**
	 * A live barmark preview of chart text, for the editor (barmark.dev's
	 * ChartRender.svelte): a `<barmark-chart>` drawn the way the saved chart
	 * is (`renderChartHtml`: dark, rehearsal letters, the `barmark-look`
	 * palette), fed through the element's `text` property and spelled with
	 * `numerals` when the Chords view asks for numbers. The element module
	 * is browser-only, so it loads on mount. Up to LONG characters it redraws
	 * on every change; above that it waits until typing pauses; above MAX it
	 * stops previewing and says so.
	 */
	interface Props {
		text: string;
		label?: string;
		/** The Chords view's spelling: each chord as its degree, or null for chord names. */
		numerals?: "nashville" | "roman" | null;
		/** The chart's background in place of the look's translucent paper (`--barmark-paper`). */
		paper?: string | null;
		/** The song's column sizing (`song.chartColumns`): `row` is the element's `columns` attribute, as the saved chart carries it. */
		columns?: ChartColumns;
	}
	let { text, label, numerals = null, paper = null, columns }: Props = $props();

	const LONG = 10_000;
	const MAX = 50_000;
	const PAUSE = 250;

	type ChartElement = HTMLElement & { text: string | null; numerals: string | null };
	let chart = $state<ChartElement>();
	let ready = $state(false);
	const tooLong = $derived(text.length > MAX);

	onMount(() => {
		let live = true;
		void import("@barmark/render/element").then(() => {
			if (live) ready = true;
		});
		return () => {
			live = false;
		};
	});

	// why $effect: hands the text to the external <barmark-chart> element (a property, not an attribute), debounced while long
	$effect(() => {
		const next = text;
		if (!ready || !chart || next.length > MAX) return;
		const element = chart;
		// Set in the same task as the text, so the element draws once.
		element.numerals = numerals ?? null;
		// A long chart's first drawing is immediate; later ones wait for a pause.
		if (next.length <= LONG || element.text === null || element.text === undefined) {
			element.text = next;
			return;
		}
		const timer = setTimeout(() => (element.text = next), PAUSE);
		return () => clearTimeout(timer);
	});
</script>

<div
	class="barmark-look min-w-0"
	style:--barmark-paper={paper}
	role={label ? "region" : undefined}
	aria-label={label}
>
	{#if tooLong}
		<p role="status" class="p-4 text-sm">
			This chart is too long to preview ({text.length.toLocaleString("en-US")} characters; the preview
			stops at {MAX.toLocaleString("en-US")}).
		</p>
	{:else}
		<barmark-chart
			bind:this={chart}
			theme="dark"
			rehearsal-letters
			columns={columns === "row" ? "row" : undefined}
		></barmark-chart>
	{/if}
</div>
