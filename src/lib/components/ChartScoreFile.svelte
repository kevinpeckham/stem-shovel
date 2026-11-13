<script lang="ts">
	import type { ChartScoreFile } from "#lib/server/songView.js";
	import type { Snippet } from "svelte";

	/**
	 * A chart read from an uploaded score: the band's approved chart is that
	 * file, so the Score view shows its pages rather than an engraving of the
	 * read; Grid shows the read. The toolbar's Grid / Score toggle picks the
	 * view (ChartViewSwitch), and the page opens on Score when there is a
	 * file (SongDocs, Kevin, 2026-11-10).
	 */
	interface Props {
		/** The PDF or image the chart was read from (`song.chartScoreFile`); null keeps the chart alone. */
		file: ChartScoreFile | null;
		/** The chart's view: Score shows the file. */
		view: "grid" | "score";
		/** The chart's grid. */
		children: Snippet;
	}
	let { file, view, children }: Props = $props();
</script>

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
