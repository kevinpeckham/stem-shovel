<script lang="ts">
	import type { Snippet } from "svelte";
	import FloatingPanel from "#lib/components/FloatingPanel.svelte";
	import SongDocPanel from "#lib/components/SongDocPanel.svelte";
	import SongDocsControls from "#lib/components/SongDocsControls.svelte";
	import SongDocsToolbar from "#lib/components/SongDocsToolbar.svelte";
	import { MAIN_ONLY } from "#lib/constants/arrangements.js";
	import { DOC_HINTS, DOC_LABELS, type SongDocs } from "#lib/state/songDocs.svelte.js";
	import { chartDefaults } from "#lib/utils/chartDefaults.js";
	import { chartSourceText } from "#lib/utils/chartSourceText.js";
	import type { ChartScoreFile } from "#lib/server/songView.js";
	import type { ChartColumns } from "#lib/val/ChartColumnsSchema.js";
	import type { ChartSource } from "#lib/val/ChartSourceSchema.js";
	import type { SongDocKind } from "#lib/val/SongDocKindSchema.js";

	interface Props {
		docs: SongDocs;
		/** What the panel reads of the song (the page's `data.song`). */
		song: {
			id: string;
			changes: Parameters<typeof chartDefaults>[0];
			chartMarkdown: string;
			/** Where the chart came from (a score file or the stems), null for the band's own. */
			chartSource: ChartSource | null;
			/** The PDF or image the chart was read from, still attached: the Score view shows it. */
			chartScoreFile?: ChartScoreFile | null;
			/** How the chart sizes its columns: the editor's preview draws it so. */
			chartColumns?: ChartColumns;
			/** Why the score cannot be engraved, null when it can. */
			noAi: boolean;
			project: { noAi: boolean };
			/** The arrangement the player shows: Generate reads Main's stems until phase 3 (docs/arrangements.md). */
			arrangementId?: string | null;
		};
		/** The rendered documents by kind (the page's `data.docs`). */
		docsHtml: Record<SongDocKind, string>;
		canEdit: boolean;
		/** The AI is configured (the page's `data.aiAvailable`); the song and its project may still turn it off. */
		aiAvailable: boolean;
		/** The AI draft or chord detection running: the ⋯ button spins. */
		busy: boolean;
		/** Rendered above the chart: the detection's error and the AI's draft card. */
		above: Snippet | undefined;
		/** "Generate from the stems" on an empty chart (the page's `chordDraft.generateChart`); no offer without it. */
		onGenerate?: () => void;
		/** The generation's current step (the page's `chordDraft.progress`), null when it is not running. */
		progress?: string | null;
		/** Cancel the generation (the page's `chordDraft.cancelDraft`). */
		oncancel?: () => void;
		/** A draft card is showing: no offer to generate meanwhile. */
		hasDraft?: boolean;
		/** "Import from a score" on an empty chart: the Attachments panel's scores, or the notation upload. */
		onimport?: () => void;
		/** "Read again" on the source line: Use as chart once more on the chart's file. */
		onreadagain?: (source: ChartSource) => void;
		/** The chart's source file has since been removed. */
		sourceGone?: boolean;
	}
	let {
		docs,
		song,
		docsHtml,
		canEdit,
		aiAvailable,
		busy,
		above,
		onGenerate,
		progress = null,
		oncancel = () => {},
		hasDraft = false,
		onimport,
		onreadagain,
		sourceGone = false,
	}: Props = $props();

	let aiOn = $derived(aiAvailable && !song.noAi && !song.project.noAi);
	let offerGenerate = $derived(!!onGenerate && aiOn && !hasDraft && !progress);
	/** The source line's file to read again: an editor's, while the file is there. */
	let readAgain = $derived(
		song.chartSource?.kind !== "stems" && canEdit && !sourceGone ? onreadagain : undefined,
	);
	/** The chart's uploaded score, for its Score view: the Chart tab only. */
	let scoreFile = $derived(docs.doc === "chart" ? song.chartScoreFile : null);
</script>

<!-- Above the chart: the generation's progress, where the chart came from, then the page's draft card. -->
{#snippet chartAbove()}
	{#if progress}
		<p class="mb-4 text-sm" role="status">
			{progress}
			<button class="ml-2 link" type="button" onclick={oncancel}>Cancel</button>
		</p>
	{/if}
	{#if song.chartSource && docsHtml.chart}
		{@const source = song.chartSource}
		<p class="mb-4 text-sm text-dim">
			{chartSourceText(source, sourceGone)}{#if readAgain}<button
					class="ml-2 link"
					type="button"
					onclick={() => readAgain(source)}>Read again</button
				>{/if}
		</p>
	{/if}
	{@render above?.()}
{/snippet}

<!-- An editor's empty chart: the three ways to fill it. -->
{#snippet emptyChart(write: () => void)}
	<p>No chart yet.</p>
	<div class="mt-2 flex flex-wrap gap-2">
		<button class="button button-sm" type="button" onclick={write}>Write it</button>
		{#if offerGenerate}
			<button
				class="button button-sm"
				type="button"
				disabled={busy || !!song.arrangementId}
				title={song.arrangementId
					? MAIN_ONLY
					: "The tempo, the chords, the sections and the bar lines, saved to the song"}
				onclick={onGenerate}>Generate from the stems</button
			>
		{/if}
		{#if onimport}
			<button
				class="button button-sm"
				type="button"
				title="Use a MusicXML, PDF or image score from the attachments as the chart"
				onclick={onimport}>Import from a score</button
			>
		{/if}
	</div>
{/snippet}

<FloatingPanel
	open={docs.mode !== "minimised"}
	floating={docs.mode === "floating"}
	title="Docs"
	storageKey="stemshovel.song.docs-panel"
	width={640}
	height={720}
	extraClass="h-full"
	onminimise={() => void docs.setMode("minimised")}
>
	{#snippet controls()}
		<SongDocsControls {docs} {canEdit} {docsHtml} {busy} />
	{/snippet}
	<SongDocsToolbar {docs} chartMarkdown={song.chartMarkdown} />
	{#if docs.notesMine}
		<!-- The user's private note: the same editor, saved as kind "mynotes" to the user's own row (docs/data-model.md). -->
		{#key `mynotes:${docs.myNote.version}`}
			<SongDocPanel
				bind:this={docs.editor}
				songId={song.id}
				kind="mynotes"
				label="My notes"
				hint="Your own notepad for this song. Nobody else sees it."
				markdown={docs.myNote.markdown}
				html={docs.myNote.html}
				version={docs.myNote.version}
				canEdit={true}
				bind:editing={docs.editing}
				view={docs.view}
				mono={docs.mono.notes}
			/>
		{/key}
	{:else}
		{#key docs.doc}
			<SongDocPanel
				bind:this={docs.editor}
				songId={song.id}
				kind={docs.doc}
				label={DOC_LABELS[docs.doc]}
				hint={DOC_HINTS[docs.doc]}
				markdown={docs.text}
				html={docsHtml[docs.doc]}
				version={docs.version}
				{canEdit}
				bind:editing={docs.editing}
				view={docs.view}
				mono={docs.mono[docs.doc]}
				above={docs.panel === "chart" ? chartAbove : undefined}
				empty={docs.panel === "chart" && canEdit ? emptyChart : undefined}
				chartDefaults={chartDefaults(song.changes)}
				numerals={docs.numerals}
				chartText={docs.chartKey.text(song.chartMarkdown)}
				{scoreFile}
				chartView={docs.chartView}
				onchartview={(v) => (docs.chartView = v)}
				chartColumns={song.chartColumns}
			/>
		{/key}
	{/if}
</FloatingPanel>
