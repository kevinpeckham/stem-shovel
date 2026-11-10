<script lang="ts">
	import { tick, type ComponentProps } from "svelte";
	import FloatingPanel from "#lib/components/FloatingPanel.svelte";
	import SongFilesPanel from "#lib/components/SongFilesPanel.svelte";
	import SongNotationPanel from "#lib/components/SongNotationPanel.svelte";
	import { MidiChart } from "#lib/state/midiChart.svelte.js";
	import type { ScoreChart } from "#lib/state/songChordDraft.svelte.js";
	import type { ChartSource } from "#lib/val/ChartSourceSchema.js";

	type FilesProps = ComponentProps<typeof SongFilesPanel>;
	type ScoresProps = ComponentProps<typeof SongNotationPanel>;
	interface Props {
		/** The panel is open (the toolbar's button toggles it; the Uploads menu opens it to pick). */
		open: boolean;
		songId: string;
		songTitle: string;
		files: FilesProps["files"];
		/** The song's MusicXML files. */
		notation: ScoresProps["notation"];
		canEdit: boolean;
		/** The AI is allowed for this song: a PDF or image score can be read into a chart. */
		aiAvailable?: boolean;
		/** "Check the song" from a score's read. */
		oncheck?: () => void;
		/** The song's tempo and meter at 0:00, for the read's readout. */
		chartDefaults?: ScoresProps["chartDefaults"];
		/** "Use as chart" on a score and "Chart from MIDI": the chart for the page's draft card. */
		onchart?: (draft: ScoreChart) => void;
	}
	let {
		open = $bindable(),
		songId,
		songTitle,
		files,
		notation,
		canEdit,
		aiAvailable = false,
		oncheck,
		chartDefaults,
		onchart,
	}: Props = $props();
	let filesPanel = $state<SongFilesPanel | null>(null);
	let scoresPanel = $state<SongNotationPanel | null>(null);
	/** The scores (PDFs and images marked as notation) are listed apart from the other attachments. */
	let scorePdfs = $derived(files.filter((f) => f.isNotation));
	let scoreCount = $derived(
		[...notation, ...scorePdfs].filter((f) => f.status === "ready" && f.url).length,
	);
	/** A MIDI file's chart names the attachment as its source. */
	const midiChart = new MidiChart();
	const fromMidi = (score: ScoreChart) =>
		onchart?.({ ...score, id: score.notationId, kind: "file" });

	/** The panel opened and mounted. */
	async function shown() {
		open = true;
		await tick();
	}
	/** The Attachments panel's picker, from the Uploads menu: the panel opened, then the picker. */
	export async function pick() {
		await shown();
		filesPanel?.pick();
	}
	/** The notation picker, from the Uploads menu. */
	export async function pickNotation() {
		await shown();
		scoresPanel?.pick();
	}
	/** A score's chart read opened for correction (the song check's card). */
	export async function reviewRead(fileId: string) {
		await shown();
		await scoresPanel?.showRead(fileId);
	}
	/** "Import from a score" on an empty chart: the scores to pick from, or the notation upload when there are none. */
	export async function importScore() {
		await shown();
		if (scoreCount === 0) scoresPanel?.pick();
	}
	/** The chart's source line's Read again: Use as chart once more on that file. */
	export async function readAgain(source: ChartSource) {
		if (!source.id || source.kind === "stems") return;
		const midi = files.find((f) => f.id === source.id && f.kind === "midi");
		if (midi) return midiChart.chart(midi, fromMidi);
		await shown();
		scoresPanel?.useAsChart(source.kind, source.id);
	}
</script>

<!-- The attachments (docs/uploads-and-blob.md, "Attachments"): every file of the song, the scores first, in a panel of their own, closed until the toolbar's button opens it (Kevin). -->
<div class="{open ? '' : 'hidden'} max-w-full lg:contents">
	<FloatingPanel
		{open}
		title="Attachments"
		storageKey="stemshovel.song.files-panel"
		width={600}
		height={640}
		onminimise={() => (open = false)}
	>
		{#snippet controls()}
			{#if canEdit}
				<button
					class="button button-xs flex items-center"
					type="button"
					title="Upload attachments: PDFs, images, audio, text, MIDI"
					aria-label="Upload attachments"
					onclick={() => filesPanel?.pick()}
				>
					<span class="i-ph-plus"></span>
				</button>
			{/if}
		{/snippet}
		<div class="flex flex-col gap-6 min-h-full">
			<SongNotationPanel
				bind:this={scoresPanel}
				{songId}
				{songTitle}
				{notation}
				pdfs={scorePdfs}
				{canEdit}
				{aiAvailable}
				{oncheck}
				{chartDefaults}
				{onchart}
			/>
			<div class="flex flex-1 flex-col gap-3">
				<h3 class="font-600 text-14px">Other attachments</h3>
				<SongFilesPanel
					bind:this={filesPanel}
					{songId}
					{songTitle}
					{files}
					{canEdit}
					scoresApart
					onnotation={(picked) => scoresPanel?.upload(picked) ?? Promise.resolve()}
					onchart={fromMidi}
				/>
			</div>
		</div>
	</FloatingPanel>
</div>
