<script lang="ts">
	import ContextMenu from "#lib/components/ContextMenu.svelte";
	import { DOC_VIEWS, type SongDocs } from "#lib/state/songDocs.svelte.js";

	interface Props {
		docs: SongDocs;
		/** The ready notation files, for the Engraving choice's count. */
		notationCount: number;
		/** The chart's text as saved, for the Key menu. */
		chartMarkdown: string;
	}
	let { docs, notationCount, chartMarkdown }: Props = $props();

	const GROUP =
		"pointer-events-auto flex overflow-hidden rounded border border-white/15 bg-oxford/95 shadow-md shadow-black/40";
	/** A choice in a two-way group: the picked one filled, the pair joined into one bar. */
	const choice = (on: boolean, index: number) =>
		`${
			on
				? "button button-xs bg-blue-300 text-oxford border-blue-300 hover-bg-blue-200 hover-border-blue-200"
				: "button button-xs opacity-80 hover-bg-blue-200 hover-border-blue-200"
		} ${index === 0 ? "rounded-r-none border-r-none" : "rounded-l-none"}`;
	const WHOSE = [
		{ id: false, label: "Project" },
		{ id: true, label: "Mine" },
	];
	let chartModes = $derived([
		{ id: "text", label: "Chords" },
		{ id: "notation", label: `Engraving (${notationCount})` },
	] as const);
</script>

{#snippet editorView()}
	<div class={GROUP} role="radiogroup" aria-label="Editor view">
		{#each DOC_VIEWS as v, index (v.id)}
			<button
				type="button"
				role="radio"
				aria-checked={docs.view === v.id}
				class={choice(docs.view === v.id, index)}
				onclick={() => (docs.view = v.id)}>{v.name}</button
			>
		{/each}
	</div>
{/snippet}

{#snippet whoseNotes()}
	<div class={GROUP} role="radiogroup" aria-label="Whose notes">
		{#each WHOSE as m, index (m.label)}
			<button
				type="button"
				role="radio"
				aria-checked={docs.notesChoice === m.id}
				title={m.id
					? "A private note of your own on this song"
					: "The notes everyone on the project sees"}
				class={choice(docs.notesChoice === m.id, index)}
				onclick={() => void docs.setNotesMine(m.id)}>{m.label}</button
			>
		{/each}
	</div>
{/snippet}

{#snippet chartTools()}
	<div class={GROUP} role="radiogroup" aria-label="Chart mode">
		{#each chartModes as m, index (m.id)}
			<button
				type="button"
				role="radio"
				aria-checked={docs.chartMode === m.id}
				class={choice(docs.chartMode === m.id, index)}
				onclick={() => void docs.setChartMode(m.id)}>{m.label}</button
			>
		{/each}
	</div>
	{#if docs.chartMode === "text"}
		<!-- How the Chords view spells chords: a syntax choice within chords, so a menu on the view (Kevin). -->
		<div class="pointer-events-auto rounded shadow-md shadow-black/40">
			<ContextMenu
				ariaLabel="Chord spelling: {docs.chordDialectShort}"
				title="Chord spelling"
				buttonBaseClasses="button button-xs gap-1 border-white/15 bg-oxford/95 opacity-80 hover-opacity-100"
				iconClass="i-ph-list-numbers"
				label={docs.chordDialectShort}
				items={docs.chordDialectItems}
			/>
		</div>
		<!-- Transposition is a view-level key choice, like the spelling (Kevin, 2026-11-02): the chart text stays as written. -->
		<div class="pointer-events-auto rounded shadow-md shadow-black/40">
			<ContextMenu
				ariaLabel="Key: {docs.chartKey.label(chartMarkdown)}"
				title="Key: the chart drawn in another key (a viewing choice; the chart itself does not change)"
				buttonBaseClasses="button button-xs gap-1 border-white/15 bg-oxford/95 opacity-80 hover-opacity-100"
				iconClass="i-ph-music-note"
				label={docs.chartKey.label(chartMarkdown)}
				items={docs.chartKey.items(chartMarkdown)}
			/>
		</div>
	{/if}
{/snippet}

{#if docs.panel === "chart" || (docs.panel === "notes" && docs.canHaveNote) || docs.editing}
	<!-- Stuck to the panel's top right: the editor's pane while a document is edited, Chords / Engraving on the Chart tab, Project / Mine on the Notes tab (Kevin). -->
	<div
		class="sticky top-0 z-10 flex items-start justify-end gap-2 h-0 overflow-visible pointer-events-none"
	>
		{#if docs.editing && !docs.notationShown && docs.panel !== "chart"}
			{@render editorView()}
		{/if}
		{#if docs.panel === "notes" && docs.canHaveNote}
			{@render whoseNotes()}
		{/if}
		{#if docs.panel === "chart"}
			{@render chartTools()}
		{/if}
	</div>
{/if}
