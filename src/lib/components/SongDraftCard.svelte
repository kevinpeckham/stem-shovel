<script lang="ts">
	import ChartHtml from "#lib/components/ChartHtml.svelte";
	import { secondsAtBar } from "#lib/audio/measures.js";
	import { saveChartDraft, saveSections } from "#lib/remote/songs.remote.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import type { SongChordDraft } from "#lib/state/songChordDraft.svelte.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";

	interface Props {
		/** The AI's draft; Discard sets it to null. */
		chordDraft: Pick<SongChordDraft, "draft">;
		songId: string;
		/** The song's bar grid (the page's `posCtx.grid`): the drafted sections' bars become seconds on it. */
		grid: Parameters<typeof secondsAtBar>[0] | null;
		/** The song has sections already: saving the drafted ones asks first. */
		hasSections: boolean;
		/** The song has a chart already: saving the drafted one asks first. */
		hasChart: boolean;
		/** After the sections are saved (the page refreshes and resets the Sections tab). */
		onsectionssaved: () => Promise<void> | void;
		/** After the chart is saved (the page refreshes). */
		onchartsaved: () => Promise<void> | void;
	}
	let { chordDraft, songId, grid, hasSections, hasChart, onsectionssaved, onchartsaved }: Props =
		$props();

	/** The model's chords ("D5 % A5 …") as chart lines, four bars each. */
	function aiChordLines(chords: string): string {
		const cells = chords.split(/\s+/).filter(Boolean);
		const lines: string[] = [];
		for (let i = 0; i < cells.length; i += 4)
			lines.push(`| ${cells.slice(i, i + 4).join(" | ")} |`);
		return lines.join("\n");
	}
	async function saveDraftSections() {
		const draft = chordDraft.draft;
		const at = grid;
		if (!draft || !at) return;
		if (hasSections && !confirm("Replace the song's sections with the drafted ones?")) return;
		try {
			await saveSections({
				id: songId,
				sections: draft.sections.map((s) => ({ name: s.name, start: secondsAtBar(at, s.bar) })),
			});
			await onsectionssaved();
			notify("Sections saved from the draft");
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
		}
	}
	async function saveDraftChart() {
		const draft = chordDraft.draft;
		if (!draft) return;
		const replace = hasChart;
		if (replace && !confirm("Replace the song's chart with the drafted one?")) return;
		try {
			await saveChartDraft({ id: songId, markdown: draft.chart, replace });
			await onchartsaved();
			notify("Chart saved from the draft");
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
		}
	}
</script>

{#if chordDraft.draft}
	<div class="mt-2 rounded bg-white/5 px-3 py-2 text-sm">
		<div class="flex flex-wrap items-center justify-between gap-2">
			<span class="font-600">AI draft</span>
			<span class="flex items-center gap-3">
				<button class="link" type="button" onclick={saveDraftSections}>Save sections</button>
				<button class="link" type="button" onclick={saveDraftChart}>Save as chart</button>
				<button class="link" type="button" onclick={() => (chordDraft.draft = null)}>Discard</button
				>
			</span>
		</div>
		{#if chordDraft.draft.chords.trim()}
			<details class="mt-2 text-12px">
				<summary class="cursor-pointer text-dim">Chords by bar</summary>
				<pre class="mt-1 whitespace-pre-wrap font-mono opacity-90">{aiChordLines(
						chordDraft.draft.chords,
					)}</pre>
			</details>
		{/if}
		<p class="mt-1 text-13px">
			<!-- Unkeyed on purpose: a draft is replaced whole, and section names repeat (two verses). -->
			{#each chordDraft.draft.sections as sec, i}{i > 0 ? " · " : ""}{sec.name} @ bar {sec.bar}{/each}
		</p>
		<ul class="mt-1 text-13px opacity-90">
			{#each chordDraft.draft.progressions as pr}
				<li><span class="font-600">{pr.section}:</span> {pr.chords}</li>
			{/each}
		</ul>
		{#if chordDraft.draft.notes}<p class="mt-1 text-12px text-dim">
				{chordDraft.draft.notes}
			</p>{/if}
		<!-- The suggested chart as it would look once saved. -->
		<article class="mt-3 chart-body rounded-md border border-current/40 bg-blue-300/5 px-6 py-6">
			<ChartHtml html={chordDraft.draft.chartHtml} />
		</article>
		<details class="mt-1 text-12px">
			<summary class="cursor-pointer text-dim">Chart markdown</summary>
			<pre class="mt-1 whitespace-pre-wrap rounded bg-black/20 p-2 opacity-90">{chordDraft.draft
					.chart}</pre>
		</details>
	</div>
{/if}
