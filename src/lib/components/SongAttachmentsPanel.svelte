<script lang="ts">
	import { tick, type ComponentProps } from "svelte";
	import FloatingPanel from "#lib/components/FloatingPanel.svelte";
	import SongFilesPanel from "#lib/components/SongFilesPanel.svelte";

	type FilesProps = ComponentProps<typeof SongFilesPanel>;
	interface Props {
		/** The panel is open (the toolbar's button toggles it; the Uploads menu opens it to pick). */
		open: boolean;
		songId: string;
		songTitle: string;
		files: FilesProps["files"];
		scores: FilesProps["scores"];
		canEdit: boolean;
		/** A MusicXML file dropped here goes to the Chart tab's flow. */
		onnotation: (files: File[]) => Promise<void>;
	}
	let {
		open = $bindable(),
		songId,
		songTitle,
		files,
		scores,
		canEdit,
		onnotation,
	}: Props = $props();
	let filesPanel = $state<SongFilesPanel | null>(null);

	/** The Attachments panel's picker, from the Uploads menu: the panel opened, then the picker. */
	export async function pick() {
		open = true;
		await tick();
		filesPanel?.pick();
	}
</script>

<!-- The attachments (docs/uploads-and-blob.md, "Attachments"): every file of the song, the scores among them, in a panel of their own, closed until the toolbar's button opens it (Kevin). -->
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
		<SongFilesPanel
			bind:this={filesPanel}
			{songId}
			{songTitle}
			{files}
			{scores}
			{canEdit}
			{onnotation}
		/>
	</FloatingPanel>
</div>
