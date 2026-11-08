<script lang="ts">
	import type { Snippet } from "svelte";
	import FloatingPanel from "#lib/components/FloatingPanel.svelte";
	import SongDocPanel from "#lib/components/SongDocPanel.svelte";
	import SongDocsControls from "#lib/components/SongDocsControls.svelte";
	import SongDocsToolbar from "#lib/components/SongDocsToolbar.svelte";
	import type { PanelFile } from "#lib/components/SongFilesPanel.svelte";
	import SongNotationPanel, { type PanelNotation } from "#lib/components/SongNotationPanel.svelte";
	import { DOC_HINTS, DOC_LABELS, type SongDocs } from "#lib/state/songDocs.svelte.js";
	import type { ScoreChart } from "#lib/state/songChordDraft.svelte.js";
	import { chartDefaults } from "#lib/utils/chartDefaults.js";
	import type { SongDocKind } from "#lib/val/SongDocKindSchema.js";

	interface Props {
		docs: SongDocs;
		/** What the panel reads of the song (the page's `data.song`). */
		song: {
			id: string;
			title: string;
			notation: PanelNotation[];
			changes: Parameters<typeof chartDefaults>[0];
			chartMarkdown: string;
			noAi: boolean;
			project: { noAi: boolean };
		};
		/** The rendered documents by kind (the page's `data.docs`). */
		docsHtml: Record<SongDocKind, string>;
		canEdit: boolean;
		/** The AI is configured (the page's `data.aiAvailable`); the song and its project may still turn it off. */
		aiAvailable: boolean;
		/** The song's PDFs marked as notation. */
		notationPdfs: PanelFile[];
		/** The ready notation files (MusicXML and PDFs marked as notation). */
		notationCount: number;
		/** The AI draft or chord detection running: the ⋯ button spins. */
		busy: boolean;
		/** "Check with the AI" from a score (the song check). */
		oncheck: () => void;
		/** Rendered above the chart: the detection's error and the AI's draft card. */
		above: Snippet | undefined;
		/** "Chart from score" on a MusicXML tile: the imported chart for the draft card (the page's `chordDraft.fromScore`). */
		onchart?: (draft: ScoreChart) => void;
		/** "Generate chart from the stems" on an empty chart (the page's `chordDraft.generateChart`); no offer without it. */
		onGenerate?: () => void;
		/** The generation's current step (the page's `chordDraft.progress`), null when it is not running. */
		progress?: string | null;
		/** Cancel the generation (the page's `chordDraft.cancelDraft`). */
		oncancel?: () => void;
		/** A draft card is showing: no offer to generate meanwhile. */
		hasDraft?: boolean;
	}
	let {
		docs,
		song,
		docsHtml,
		canEdit,
		aiAvailable,
		notationPdfs,
		notationCount,
		busy,
		oncheck,
		above,
		onchart = () => {},
		onGenerate,
		progress = null,
		oncancel = () => {},
		hasDraft = false,
	}: Props = $props();

	let aiOn = $derived(aiAvailable && !song.noAi && !song.project.noAi);
	let offerGenerate = $derived(
		!!onGenerate && !docsHtml.chart && canEdit && aiOn && !hasDraft && !progress,
	);
</script>

<!-- Above the chart: the generation's progress or, on an empty chart, the offer to generate one; then the page's draft card. -->
{#snippet chartAbove()}
	{#if progress}
		<p class="mb-4 text-sm" role="status">
			{progress}
			<button class="ml-2 link" type="button" onclick={oncancel}>Cancel</button>
		</p>
	{:else if offerGenerate}
		<div class="mb-4 text-sm">
			<p>
				Generate a chart from the stems: the tempo, the chords, the sections and the bar lines,
				saved to the song.
			</p>
			<button class="mt-2 button button-sm" type="button" disabled={busy} onclick={onGenerate}
				>Generate chart from the stems</button
			>
		</div>
	{/if}
	{@render above?.()}
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
	<SongDocsToolbar {docs} {notationCount} chartMarkdown={song.chartMarkdown} />
	{#if docs.notationShown}
		<!-- The notation files (docs/uploads-and-blob.md, "Notation"): MusicXML engraved in the browser. -->
		<SongNotationPanel
			bind:this={docs.notation}
			songId={song.id}
			songTitle={song.title}
			notation={song.notation}
			pdfs={notationPdfs}
			{canEdit}
			aiAvailable={aiOn}
			{oncheck}
			{onchart}
			chartDefaults={chartDefaults(song.changes)}
		/>
	{:else if docs.notesMine}
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
				chartDefaults={chartDefaults(song.changes)}
				numerals={docs.numerals}
				chartText={docs.chartKey.text(song.chartMarkdown)}
			/>
		{/key}
	{/if}
</FloatingPanel>
