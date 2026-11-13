<script lang="ts">
	import ChartViewSwitch from "#lib/components/ChartViewSwitch.svelte";
	import ContextMenu from "#lib/components/ContextMenu.svelte";
	import type { ChordDialectChoice } from "#lib/state/chordDialect.svelte.js";

	/**
	 * The home page's chart demo's tools, in its top-right row: Grid / Score
	 * (not while editing: the preview is the plain grid) and the spelling.
	 */
	interface Props {
		/** How the chart spells chords, the same remembered choice as the song page. */
		spelling: ChordDialectChoice;
		/** The chart's view. */
		view: "grid" | "score";
		/** Called with the view pressed. */
		onpick: (view: "grid" | "score") => void;
		/** The chart is open in the editor. */
		editing: boolean;
	}
	let { spelling, view, onpick, editing }: Props = $props();
</script>

{#if !editing}
	<!-- Hidden in a phone-width panel: the row has no room for it beside the picker; the grid stays. -->
	<ChartViewSwitch
		class="hidden @sm:flex overflow-hidden rounded border border-white/15"
		{view}
		{onpick}
	/>
{/if}
<ContextMenu
	ariaLabel="Chord spelling: {spelling.short}"
	title="Chord spelling"
	buttonBaseClasses="button button-xs gap-1 border-white/15 bg-oxford/95 opacity-80 hover-opacity-100"
	iconClass="i-ph-list-numbers"
	label={spelling.short}
	items={spelling.items}
/>
