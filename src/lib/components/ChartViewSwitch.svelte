<script lang="ts">
	/**
	 * The chart's Grid / Score toggle, ours in place of `<barmark-score>`'s
	 * own switch (hidden in ChartHtml): a two-way group like the toolbar's
	 * others, the picked one filled.
	 */
	interface Props {
		/** The view shown. */
		view: "grid" | "score";
		/** Called with the view pressed. */
		onpick: (view: "grid" | "score") => void;
		/** The pair's wrapper classes: the toolbar's floating group by default. */
		class?: string;
		title?: string;
	}
	let {
		view,
		onpick,
		class:
			wrapper = "pointer-events-auto flex overflow-hidden rounded border border-white/15 bg-oxford/95 shadow-md shadow-black/40",
		title = "The chart as a grid of bars or engraved as a score",
	}: Props = $props();

	const VIEWS = [
		{ id: "grid", label: "Grid" },
		{ id: "score", label: "Score" },
	] as const;
	/** A choice in the pair: the picked one filled, the two joined into one bar. */
	const choice = (on: boolean, index: number) =>
		`${
			on
				? "button button-xs bg-blue-300 text-oxford border-blue-300 hover-bg-blue-200 hover-border-blue-200"
				: "button button-xs opacity-80 hover-bg-blue-200 hover-border-blue-200"
		} ${index === 0 ? "rounded-r-none border-r-none" : "rounded-l-none"}`;
</script>

<div class={wrapper} role="radiogroup" aria-label="View" {title}>
	{#each VIEWS as v, index (v.id)}
		<button
			type="button"
			role="radio"
			aria-checked={view === v.id}
			class={choice(view === v.id, index)}
			onclick={() => onpick(v.id)}>{v.label}</button
		>
	{/each}
</div>
