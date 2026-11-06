<script lang="ts">
	import { SongPlayerLayout } from "#lib/state/songPlayerLayout.svelte.js";

	interface Props {
		layout: SongPlayerLayout;
		/** The song's stems (`data.manifest.stems.length`). */
		stemCount: number;
		/** The ready demos. */
		demoCount: number;
		/** The ready mixes. */
		mixCount: number;
	}
	let { layout, stemCount, demoCount, mixCount }: Props = $props();
	const VIEWS = SongPlayerLayout.VIEWS;
	let labels = $derived({
		stems: `Stems (${stemCount})`,
		demos: `Demos (${demoCount})`,
		mixes: `Mixes (${mixCount})`,
	});
	/** The tabs join into one bar: the first and last keep their outer corners. */
	const edge = (index: number) =>
		index === 0
			? "rounded-r-none border-r-none"
			: index === VIEWS.length - 1
				? "rounded-l-none"
				: "rounded-none border-r-none";
</script>

<!-- The player panel's header: the views as tabs, and the pop-out / dock button from lg. -->
<div
	class="flex items-center overflow-hidden rounded border border-white/15"
	role="tablist"
	aria-label="Player view"
>
	{#each VIEWS as view, index (view)}
		<button
			type="button"
			role="tab"
			aria-selected={layout.view === view}
			class="{layout.view === view
				? 'button button-xs bg-blue-300 text-oxford border-blue-300 hover-bg-blue-200 hover-border-blue-200'
				: 'button button-xs opacity-80 hover-bg-blue-200 hover-border-blue-200'} {edge(index)}"
			onclick={() => layout.show(view)}>{labels[view]}</button
		>
	{/each}
</div>
<button
	class="button button-xs hidden lg-inline-flex"
	type="button"
	title={layout.mode === "floating"
		? "Put the player back in its column"
		: "Pop the player out into a panel"}
	aria-label={layout.mode === "floating" ? "Dock the player" : "Pop out the player"}
	onclick={() => layout.setMode(layout.mode === "floating" ? "docked" : "floating")}
>
	<span
		class={layout.mode === "floating" ? "i-ph-arrows-in-simple" : "i-ph-arrows-out-simple"}
		aria-hidden="true"
	></span>
</button>
