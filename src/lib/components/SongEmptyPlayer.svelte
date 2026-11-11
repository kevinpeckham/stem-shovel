<script lang="ts">
	import type { ComponentProps } from "svelte";
	import StemUploader from "#lib/components/StemUploader.svelte";
	import { DEMO_ACCEPT, DEMO_FORMAT_LIST } from "#lib/constants/demoFormats.js";
	import type { DemoUploads } from "#lib/state/demoUploads.svelte.js";
	import type { StemUploads } from "#lib/state/stemUploads.svelte.js";
	import { decodedStemBytes } from "#lib/utils/decodedStemBytes.js";

	type UploaderProps = ComponentProps<typeof StemUploader>;
	interface Props {
		songId: string;
		/** The arrangement shown (docs/arrangements.md): new stems join it; null or absent for Main. */
		arrangementId?: string | null;
		/** The song's stems, in-flight ones included (`data.song.stems`). */
		stems: Parameters<typeof decodedStemBytes>[0];
		canEdit: boolean;
		uploads: StemUploads;
		demos: DemoUploads;
		/** A batch went up (StemActions.offer). */
		onuploaded: UploaderProps["onuploaded"];
		/** What the batch sounds like (SongCheck.applyDetection). */
		onanalysis: UploaderProps["onanalysis"];
	}
	let {
		songId,
		arrangementId = null,
		stems,
		canEdit,
		uploads,
		demos,
		onuploaded,
		onanalysis,
	}: Props = $props();
</script>

<!-- The player's box, empty: the page keeps its shape before the first stem arrives. -->
<div
	class="grid min-h-560px place-content-center rounded-md border border-current/40 bg-blue/5 px-4 py-3 text-center"
>
	<p class="text-sm text-dim">No stems yet.</p>
	{#if canEdit}
		<p class="mt-1 text-sm opacity-80">
			Upload stems, start with a demo recording of the idea, or record one now.
		</p>
		<div class="mt-4 flex flex-wrap items-center justify-center gap-3">
			<StemUploader
				bind:this={uploads.uploader}
				{songId}
				{arrangementId}
				stemCount={stems.length}
				decodedBytes={decodedStemBytes(stems)}
				bind:jobs={uploads.jobs}
				bind:notice={uploads.notice}
				{onuploaded}
				{onanalysis}
				label="Upload stems"
				class="inline-flex items-center gap-2"
			/>
			<label
				class="button button-sm inline-flex cursor-pointer items-center gap-2 {demos.busy
					? 'pointer-events-none opacity-50'
					: ''}"
				title="Phone memos, rough takes, the original idea ({DEMO_FORMAT_LIST})"
			>
				<span class="i-ph-microphone" aria-hidden="true"></span>
				{demos.busy ? "Uploading…" : "Upload a demo"}
				<input
					class="sr-only"
					type="file"
					accept={DEMO_ACCEPT}
					multiple
					disabled={demos.busy}
					onchange={(e) => demos.upload(e.currentTarget)}
				/>
			</label>
			<a
				class="button button-sm inline-flex items-center gap-2"
				href="/idea-recorder?song={songId}"
				title="Idea recorder: record a riff, a melody or a demo for this song"
			>
				<span class="i-ph-record-fill text-red-500" aria-hidden="true"></span>
				Record a demo
			</a>
		</div>
	{/if}
</div>
