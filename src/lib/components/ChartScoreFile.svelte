<script lang="ts">
	import type { ChartScoreFile } from "#lib/server/songView.js";
	import type { Snippet } from "svelte";

	interface Props {
		/** The PDF or image the chart was read from (`song.chartScoreFile`); null keeps the chart alone. */
		file: ChartScoreFile | null;
		/** The chart's grid. */
		children: Snippet;
	}
	let { file, children }: Props = $props();

	/**
	 * A chart read from an uploaded score: the band's approved chart is that
	 * file, so the Score view shows its pages rather than an engraving of the
	 * read. A Grid / Score switch like `<barmark-score>`'s (the same labels
	 * and radio pattern). Score first: the file is the band's source of truth,
	 * so the page opens on it, and Grid is the read beside it (Kevin, 2026-11-10).
	 */
	let view = $state<"grid" | "score">("score");
	const VIEWS = [
		{ id: "grid", label: "Grid" },
		{ id: "score", label: "Score" },
	] as const;
	const choice = (on: boolean, index: number) =>
		`button button-xs ${on ? "bg-blue-300 text-oxford border-blue-300" : "opacity-80"} hover-bg-blue-200 hover-border-blue-200 ${index === 0 ? "rounded-r-none border-r-none" : "rounded-l-none"}`;
</script>

{#if file}
	<div class="mb-2 inline-flex" role="radiogroup" aria-label="View">
		{#each VIEWS as v, index (v.id)}
			<button
				type="button"
				role="radio"
				aria-checked={view === v.id}
				class={choice(view === v.id, index)}
				onclick={() => (view = v.id)}>{v.label}</button
			>
		{/each}
	</div>
{/if}
{#if file && view === "score"}
	<figure class="m-0">
		{#if file.kind === "image"}
			<img class="max-w-full h-auto rounded bg-white" src={file.url} alt={file.name} />
		{:else}
			<iframe class="w-full min-h-480px h-[70vh] rounded bg-white" src={file.url} title={file.name}
			></iframe>
		{/if}
		<figcaption class="mt-2 text-sm text-dim">
			{file.name}
			<a class="ml-2 link" href={file.url} target="_blank" rel="noopener">Open in a new tab</a>
		</figcaption>
	</figure>
{:else}
	{@render children()}
{/if}
