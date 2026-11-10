<script lang="ts">
	import ChartReadout from "#lib/components/ChartReadout.svelte";
	import FloatingPanel from "#lib/components/FloatingPanel.svelte";
	import type { PanelFile } from "#lib/components/SongFilesPanel.svelte";
	import {
		clearChartReadOfFile,
		readChartOfFile,
		saveChartReadOfFile,
	} from "#lib/remote/files.remote.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { chartReadIssues } from "#lib/utils/chartReadIssues.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";

	/**
	 * What the AI read of a score as a PDF or image (docs/audio-engine.md,
	 * "The chart read is stored"): a barmark chart, shown for correction
	 * (with barmark's errors as the member types) before it anchors the
	 * song-check, or used as the song's chart through the draft card. The
	 * Scores section (SongNotationPanel) opens it with `show(file)`.
	 */
	interface Props {
		/** The song's tempo and meter at 0:00 (`chartDefaults`), for the readout under the read: how many bars it plays and how long. */
		chartDefaults?: { tempo: number | null; meter: string | null };
		/** Run the song-check with the (corrected) read: the page asks the AI and shows its card. */
		oncheck?: () => void;
		/** "Use as chart" with the read as it stands: the page's draft card. */
		onuse: (file: PanelFile, text: string) => void;
		/** A chart is being made from a score: Use as chart waits. */
		using?: boolean;
	}
	let { chartDefaults, oncheck, onuse, using = false }: Props = $props();
	const nameOf = (f: PanelFile) => f.title || f.filename;

	interface Reading {
		file: PanelFile;
		text: string;
		/** The text as stored; `text` differs while an edit is unsaved. */
		stored: string;
		edited: boolean;
		busy: boolean;
		error: string | null;
	}
	let reading = $state<Reading | null>(null);
	let readWarnings = $derived(reading ? chartReadIssues(reading.text) : []);
	let readDirty = $derived(!!reading && reading.text !== reading.stored);
	/** Open the read of a score file (the ⋯ menu, or the page's card when a check's read looked wrong). */
	export async function show(file: PanelFile) {
		const fileId = file.id;
		reading = { file, text: "", stored: "", edited: false, busy: true, error: null };
		try {
			const r = await readChartOfFile({ id: fileId });
			if (reading?.file.id !== fileId) return;
			reading = { ...reading, text: r.text, stored: r.text, edited: r.edited, busy: false };
			if (r.fromModel) notify(`The AI read ${nameOf(file)}`, { kind: "info" });
		} catch (e) {
			if (reading?.file.id !== fileId) return;
			reading = { ...reading, busy: false, error: errorMessage(e) };
		}
	}
	async function saveRead() {
		if (!reading || reading.busy) return;
		const id = reading.file.id;
		reading = { ...reading, busy: true, error: null };
		try {
			const r = await saveChartReadOfFile({ id, text: reading.text });
			if (reading?.file.id !== id) return;
			reading = { ...reading, text: r.text, stored: r.text, edited: true, busy: false };
			notify("Your corrected read is saved; the AI checks the song against it from now on");
		} catch (e) {
			if (reading?.file.id !== id) return;
			reading = { ...reading, busy: false, error: errorMessage(e) };
		}
	}
	/** The stored read gone, the model reads the file again (a correction is lost; the button says so). */
	async function readAgain() {
		if (!reading || reading.busy) return;
		if (reading.edited && !confirm("Drop your corrected read and let the AI read the file again?"))
			return;
		const id = reading.file.id;
		reading = { ...reading, busy: true, error: null };
		try {
			await clearChartReadOfFile({ id });
			await show(reading.file);
		} catch (e) {
			if (reading?.file.id !== id) return;
			reading = { ...reading, busy: false, error: errorMessage(e) };
		}
	}
</script>

<!-- What the AI read: the barmark chart in an editor, what looks wrong and barmark's errors in amber (utils/chartReadIssues.ts), saved as the read the song-check uses. Under it the readout the chart editor has (ChartReadout): the bars it plays, its sections and its length at the song's tempo, the quickest check of a read against the recording. -->
<FloatingPanel
	open={reading !== null}
	title={reading ? `What the AI read of ${nameOf(reading.file)}` : ""}
	storageKey="stemshovel.song.chart-read"
	width={720}
	height={640}
	onminimise={() => (reading = null)}
>
	{#snippet controls()}
		{#if reading}
			<button
				class="button button-xs"
				type="button"
				disabled={reading.busy || !readDirty}
				title="Keep this text as the chart the AI checks the song against"
				onclick={saveRead}
			>
				<span class="i-ph-floppy-disk" aria-hidden="true"></span>
				Save
			</button>
			<button
				class="button button-xs"
				type="button"
				disabled={reading.busy}
				title={reading.edited
					? "Drop the corrected read and let the AI read the file again"
					: "Let the AI read the file again"}
				onclick={readAgain}
			>
				<span class="i-ph-arrow-clockwise" aria-hidden="true"></span>
				Read again
			</button>
			<button
				class="button button-xs"
				type="button"
				disabled={reading.busy || !reading.text.trim() || using}
				title="This read on the draft card, to save as the song's chart"
				onclick={() => reading && onuse(reading.file, reading.text)}
			>
				<span class="i-ph-text-columns" aria-hidden="true"></span>
				Use as chart
			</button>
			{#if oncheck}
				<button
					class="button button-xs"
					type="button"
					disabled={reading.busy || readDirty}
					title={readDirty
						? "Save the read first"
						: "Ask the AI to check the song's key, tempo and meter against this read"}
					onclick={() => {
						reading = null;
						oncheck?.();
					}}
				>
					<span class="i-ph-sparkle" aria-hidden="true"></span>
					Check the song
				</button>
			{/if}
		{/if}
	{/snippet}
	<div class="min-h-full flex flex-col gap-2 p-2" aria-live="polite">
		{#if reading?.busy && !reading.text}
			<p class="p-2 text-14px opacity-60">Reading the chart…</p>
		{:else if reading}
			<p class="text-12px opacity-70">
				A chart in the band's notation (barmark), one bar per measure, as the AI read the file{reading.edited
					? "; corrected by the band"
					: ""}. Fix a wrong key, chord or bar here and save: it becomes the read the song-check
				uses, not the file.
			</p>
			{#if readWarnings.length > 0}
				<ul class="text-13px text-amber-300 grid gap-1" role="alert">
					{#each readWarnings as w (w)}
						<li>
							<span class="i-ph-warning align-text-bottom" aria-hidden="true"></span>
							{w}
						</li>
					{/each}
				</ul>
			{/if}
			{#if reading.error}
				<p class="text-13px text-red-400" role="alert">{reading.error}</p>
			{/if}
			<textarea
				class="field font-mono text-12px leading-snug flex-1 min-h-320px w-full resize-y"
				spellcheck="false"
				aria-label="What the AI read, one bar per measure"
				disabled={reading.busy}
				bind:value={reading.text}></textarea>
			<ChartReadout markdown={reading.text} defaults={chartDefaults} warnings={false} />
		{/if}
	</div>
</FloatingPanel>
