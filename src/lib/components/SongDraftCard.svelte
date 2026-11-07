<script lang="ts">
	import ChartHtml from "#lib/components/ChartHtml.svelte";
	import { secondsAtBar } from "#lib/audio/measures.js";
	import { saveChartDraft, saveSections } from "#lib/remote/songs.remote.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import SongDraftDetails from "#lib/components/SongDraftDetails.svelte";
	import type { ChartDraft, SongChordDraft } from "#lib/state/songChordDraft.svelte.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";

	interface Props {
		/** The AI's draft or a score's chart (`ChartDraft`); Discard sets it to null. */
		chordDraft: Pick<SongChordDraft, "draft" | "chartPart" | "partBusy">;
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

	/** The card's title: the AI's draft, the chart built from the detected chords, or the score a chart was read from (and the part, when one was charted). */
	const headingOf = (draft: ChartDraft) => {
		if (draft.source === "built") return "Draft from the detected chords";
		if (draft.source !== "score") return "AI draft";
		const score = `Chart from ${draft.scoreName ?? "the score"}`;
		return draft.partName ? `${score}, the ${draft.partName} part` : score;
	};
	/** A score's chart with nothing in it: no Save as chart and no preview; the parts instead when it names any. */
	const isEmpty = (draft: ChartDraft) => draft.source === "score" && !draft.chart.trim();
	const levelClass = (level: "error" | "warning") =>
		level === "error" ? "text-red-400" : "text-amber-300";
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
			// A drafted chart's timing map and confidence are kept beside it (checked on the server).
			await saveChartDraft({
				id: songId,
				markdown: draft.chart,
				replace,
				...(draft.timing
					? { timing: draft.timing, confidence: draft.confidence ?? undefined }
					: {}),
			});
			await onchartsaved();
			notify("Chart saved from the draft");
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
		}
	}
</script>

<!-- A score without chord symbols: its parts of notes, one button each, to chart one as note sets. -->
{#snippet partPicker(parts: string[])}
	{#if parts.length > 0}
		<p class="mt-2">No chord symbols in this score. Chart a part's notes instead:</p>
		<div class="mt-1 flex flex-wrap gap-2">
			{#each parts as part (part)}
				<button
					class="button button-xs"
					type="button"
					disabled={chordDraft.partBusy}
					onclick={() => chordDraft.chartPart(part)}>{part}</button
				>
			{/each}
		</div>
	{/if}
{/snippet}

{#if chordDraft.draft}
	{@const draft = chordDraft.draft}
	<div class="mt-2 rounded bg-white/5 px-3 py-2 text-sm">
		<div class="flex flex-wrap items-center justify-between gap-2">
			<span class="font-600">{headingOf(draft)}</span>
			<span class="flex items-center gap-3">
				{#if draft.sections.length > 0}
					<button class="link" type="button" onclick={saveDraftSections}>Save sections</button>
				{/if}
				{#if !isEmpty(draft)}
					<button class="link" type="button" onclick={saveDraftChart}>Save as chart</button>
				{/if}
				<button class="link" type="button" onclick={() => (chordDraft.draft = null)}>Discard</button
				>
			</span>
		</div>
		{#if draft.diagnostics?.length}
			<!-- What the score's import could not carry over, or what the chart builder noticed: the packages' own sentences. Unkeyed: a draft is replaced whole. -->
			<ul class="mt-1 text-12px">
				{#each draft.diagnostics as d}
					<li class={levelClass(d.level)}>{d.message}</li>
				{/each}
			</ul>
		{/if}
		{#if isEmpty(draft)}
			{@render partPicker(draft.parts ?? [])}
		{:else}
			<SongDraftDetails {draft} />
			<!-- The suggested chart as it would look once saved. -->
			<article class="mt-3 chart-body rounded-md border border-current/40 bg-blue-300/5 px-6 py-6">
				<ChartHtml html={draft.chartHtml} />
			</article>
			<details class="mt-1 text-12px">
				<summary class="cursor-pointer opacity-70">Chart markdown</summary>
				<pre class="mt-1 whitespace-pre-wrap rounded bg-black/20 p-2 opacity-90">{draft.chart}</pre>
			</details>
		{/if}
	</div>
{/if}
