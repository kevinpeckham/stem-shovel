<script lang="ts">
	import type { StemEngine } from "#lib/audio/engine.svelte.js";
	import IconDrumKit from "#lib/components/IconDrumKit.svelte";
	import StemReplacer from "#lib/components/StemReplacer.svelte";
	import StemUploader, { type UploadJob } from "#lib/components/StemUploader.svelte";
	import { DEMO_ACCEPT, DEMO_FORMAT_LIST, MAX_DEMOS_PER_SONG } from "#lib/constants/demoFormats.js";
	import { MIX_FORMAT_LIST } from "#lib/constants/mixFormats.js";
	import type { DemoUploads } from "#lib/state/demoUploads.svelte.js";
	import type { SongCheck } from "#lib/state/songCheck.svelte.js";
	import type { SongDownloads } from "#lib/state/songDownloads.svelte.js";
	import { decodedStemBytes } from "#lib/utils/decodedStemBytes.js";
	import { downloadBuilt } from "#lib/utils/downloadBuilt.js";

	/**
	 * The song player's action row: the Uploads menu (stems added or replaced,
	 * demos, a mix, attachments, notation, the recorder and the drum machine),
	 * the Downloads menu (the stems as a zip, the two mixes, Dawn, the
	 * documentation PDF, the demos), Record Demo, and the mix's Reset and Save
	 * as Default. The downloads' state is `SongDownloads`; the stem uploads'
	 * jobs and notice are the page's (bound, the empty player's uploader shares
	 * them), and so is everything the menu only starts (the pickers, the
	 * version offer after an upload).
	 */
	interface Props {
		downloads: SongDownloads;
		demos: DemoUploads;
		/** The uploader's detection goes to the song check. */
		check: SongCheck;
		/** The song as saved: its id and title, and the stems for the uploader and the replacer. */
		song: {
			id: string;
			title: string;
			stems: {
				id: string;
				label: string;
				filename: string;
				durationSeconds?: number | null;
				channels?: number | null;
			}[];
		};
		/** The song's documents, for the documentation PDF. */
		docs: { lyrics?: unknown; chart?: unknown; notes?: unknown };
		canEdit: boolean;
		/** The Stem Player's engine, once it has one: the mix buttons need it. */
		engine: StemEngine | null;
		/** The ready stems and demos (only how many is read). */
		ready: readonly unknown[];
		readyDemos: readonly unknown[];
		/** A mix upload is in flight. */
		mixBusy: boolean;
		/** The listener moved something away from the default mix. */
		mixDirty: boolean;
		/** The faders and pans alone differ from the default: there is a new default to save. */
		fadersDirty: boolean;
		/** The stem uploads' progress and refusal, shared with the empty player's uploader. */
		jobs?: UploadJob[];
		notice?: string | null;
		/** The menu's stem uploader, for the page's "Retry failed". */
		uploader?: StemUploader | null;
		/** A stem upload or replacement finished: the page offers a version bump. */
		onuploaded: () => void;
		onpickmix: () => void;
		onpickfiles: () => void;
		onpicknotation: () => void;
		/** Show the demos in the player. */
		onshowdemos: () => void;
		/** Back to the song's default mix. */
		onresetmix: () => void;
	}
	let {
		downloads,
		demos,
		check,
		song,
		docs,
		canEdit,
		engine,
		ready,
		readyDemos,
		mixBusy,
		mixDirty,
		fadersDirty,
		jobs = $bindable([]),
		notice = $bindable(null),
		uploader = $bindable(null),
		onuploaded,
		onpickmix,
		onpickfiles,
		onpicknotation,
		onshowdemos,
		onresetmix,
	}: Props = $props();

	/** The two menus, closed on a click outside them. */
	let uploadsEl = $state<HTMLDetailsElement | null>(null);
	let downloadsEl = $state<HTMLDetailsElement | null>(null);
</script>

<svelte:window
	onpointerdown={(e) => {
		for (const menu of [uploadsEl, downloadsEl]) {
			if (menu?.open && !menu.contains(e.target as Node)) menu.open = false;
		}
	}}
/>

<div
	class="flex flex-wrap items-center gap-3 w-full border py-4 px-3 rounded-md border-current/40 bg-blue-300/5 text-15px"
>
	{#if canEdit}
		{@render uploadsMenu()}
	{/if}
	{#if ready.length > 0 || readyDemos.length > 0 || docs.lyrics || docs.chart || docs.notes}
		{@render downloadsMenu()}
	{/if}
	{#if canEdit}
		<a
			class="button button-sm"
			href="/idea-recorder?song={song.id}"
			title="Idea recorder: record a riff, a melody or a demo for this song"
		>
			<span class="i-ph-record-fill text-red-500" aria-hidden="true"></span>
			Record Demo
		</a>
	{/if}
	{#if engine && mixDirty}
		<button
			class="button button-sm lg-button-xs"
			type="button"
			onclick={onresetmix}
			title="Back to the song's default mix (your own levels are kept in this browser only)"
		>
			<span class="i-ph-arrow-counter-clockwise" aria-hidden="true"></span>
			Reset Mix
		</button>
	{/if}
	{#if canEdit && engine && fadersDirty}
		<button
			class="button button-sm lg-button-xs"
			type="button"
			disabled={downloads.savingMix}
			onclick={() => void downloads.saveMixAsDefault()}
			title="Save these fader levels as the default mix for every listener"
		>
			<span class="i-ph-floppy-disk" aria-hidden="true"></span>
			{downloads.savingMix ? "Saving…" : "Save as Default Mix"}
		</button>
	{/if}
	{#if downloads.mixError}
		<p class="w-full text-sm text-red-400" role="alert">{downloads.mixError}</p>
	{/if}
	{#if demos.notice}
		<p class="w-full text-sm text-red-400" role="alert">{demos.notice}</p>
	{/if}
</div>

{#snippet uploadsMenu()}
	<!-- Uploads: add or replace stems, upload demo recordings. -->
	<details class="relative" bind:this={uploadsEl}>
		<summary
			class="button button-sm list-none [&::-webkit-details-marker]:hidden"
			title="Add or replace stems, upload demo recordings and PDFs"
		>
			<span class="i-ph-upload-simple" aria-hidden="true"></span>
			Uploads
			<span class="i-ph-caret-down ml-1 text-10px" aria-hidden="true"></span>
		</summary>
		<div
			class="absolute top-full left-0 z-20 mt-1 min-w-52 rounded border border-white/15 bg-oxford p-1 text-sm shadow-lg"
			role="menu"
			tabindex="-1"
			onclick={() => {
				if (uploadsEl) uploadsEl.open = false;
			}}
			onkeydown={(e) => {
				if (e.key === "Escape" && uploadsEl) uploadsEl.open = false;
			}}
		>
			<StemUploader
				bind:this={uploader}
				songId={song.id}
				stemCount={song.stems.length}
				decodedBytes={decodedStemBytes(song.stems)}
				bind:jobs
				bind:notice
				{onuploaded}
				onanalysis={check.applyDetection}
				menu
			/>
			{#if song.stems.length > 0}
				<StemReplacer
					songId={song.id}
					stems={song.stems.map((s) => ({
						id: s.id,
						label: s.label,
						filename: s.filename,
					}))}
					bind:jobs
					bind:notice
					{onuploaded}
					onanalysis={check.applyDetection}
					menu
				/>
			{/if}
			<label
				class="block w-full cursor-pointer rounded px-3 py-1.5 text-left hover:bg-white/10 {demos.busy
					? 'opacity-50 pointer-events-none'
					: ''}"
				title="Phone memos, rough takes, the original idea ({DEMO_FORMAT_LIST})"
			>
				<span class="i-ph-microphone mr-2" aria-hidden="true"></span>
				{demos.busy ? "Uploading…" : "Upload Demos"}
				<input
					class="sr-only"
					type="file"
					accept={DEMO_ACCEPT}
					multiple
					disabled={demos.busy || readyDemos.length >= MAX_DEMOS_PER_SONG}
					onchange={(e) => demos.upload(e.currentTarget)}
				/>
			</label>
			<button
				class="block w-full rounded px-3 py-1.5 text-left hover:bg-white/10 {mixBusy
					? 'opacity-50 pointer-events-none'
					: ''}"
				type="button"
				role="menuitem"
				title="A bounce for the band to hear and comment on ({MIX_FORMAT_LIST})"
				onclick={onpickmix}
			>
				<span class="i-ph-waveform mr-2" aria-hidden="true"></span>
				{mixBusy ? "Uploading…" : "Upload Mix"}
			</button>
			<button
				class="block w-full rounded px-3 py-1.5 text-left hover:bg-white/10"
				type="button"
				role="menuitem"
				title="PDFs, images, audio scraps, text, MIDI: one or more files"
				onclick={onpickfiles}
			>
				<span class="i-ph-paperclip mr-2" aria-hidden="true"></span>
				Upload Attachments
			</button>
			<button
				class="block w-full rounded px-3 py-1.5 text-left hover:bg-white/10"
				type="button"
				role="menuitem"
				title="MusicXML notation, as Dorico and the rest export it; engraved on the Chart tab"
				onclick={onpicknotation}
			>
				<span class="i-ph-music-notes-simple mr-2" aria-hidden="true"></span>
				Upload Notation
			</button>
			<a
				class="block w-full rounded px-3 py-1.5 text-left hover:bg-white/10"
				role="menuitem"
				href="/idea-recorder?song={song.id}"
				title="Idea recorder: record a riff, a melody or a demo for this song"
			>
				<span class="i-ph-record-fill mr-2 text-red-500" aria-hidden="true"></span>
				Record Demo
			</a>
			<a
				class="block w-full rounded px-3 py-1.5 text-left hover:bg-white/10"
				role="menuitem"
				href="/drum-machine?song={song.id}"
				title="Drum machine: a beat at this song's tempo, saved to the song or added as a demo"
			>
				<span class="mr-2 inline-block align-[-2px]"><IconDrumKit /></span>
				Drum Machine
			</a>
		</div>
	</details>
{/snippet}

{#snippet downloadsMenu()}
	<!-- Downloads: the stems, the two mixes, the demo recordings, the documentation PDF. -->
	<details class="relative" bind:this={downloadsEl}>
		<summary
			class="button button-sm list-none [&::-webkit-details-marker]:hidden"
			title="Download the stems, a mix or the demo recordings"
		>
			<span class="i-ph-download-simple" aria-hidden="true"></span>
			Downloads
			<span class="i-ph-caret-down ml-1 text-10px" aria-hidden="true"></span>
		</summary>
		<div
			class="absolute top-full left-0 z-20 mt-1 min-w-52 rounded border border-white/15 bg-oxford p-1 text-sm shadow-lg"
			role="menu"
			tabindex="-1"
			onclick={() => {
				if (downloadsEl) downloadsEl.open = false;
			}}
			onkeydown={(e) => {
				if (e.key === "Escape" && downloadsEl) downloadsEl.open = false;
			}}
		>
			{#if ready.length > 0}
				<button
					class="block w-full rounded px-3 py-1.5 text-left hover:bg-white/10 disabled:opacity-50"
					type="button"
					role="menuitem"
					disabled={!!downloads.zipping}
					onclick={() => void downloads.downloadAll()}
					title="Every stem as one zip"
				>
					<span class="i-ph-file-zip mr-2" aria-hidden="true"></span>
					{downloads.zipping ?? "Download Stems"}
				</button>
				<button
					class="block w-full rounded px-3 py-1.5 text-left hover:bg-white/10 disabled:opacity-50"
					type="button"
					role="menuitem"
					disabled={!!downloads.mixing}
					onclick={() => void downloads.downloadMix("original")}
					title="An MP3 of the song's default mix"
				>
					<span class="i-ph-music-note mr-2" aria-hidden="true"></span>
					{downloads.mixing === "original" ? "Rendering…" : "Original Stem Mix (MP3)"}
				</button>
				<button
					class="block w-full rounded px-3 py-1.5 text-left hover:bg-white/10 disabled:opacity-50"
					type="button"
					role="menuitem"
					disabled={!!downloads.mixing}
					onclick={() => void downloads.downloadMix("custom")}
					title="An MP3 of what is audible now (mute, solo, faders)"
				>
					<span class="i-ph-sliders-horizontal mr-2" aria-hidden="true"></span>
					{downloads.mixing === "custom" ? "Rendering…" : "Custom Stem Mix (MP3)"}
				</button>
				{#if canEdit}
					<button
						class="block w-full rounded px-3 py-1.5 text-left hover:bg-white/10 disabled:opacity-50"
						type="button"
						role="menuitem"
						disabled={downloads.openingInDawn}
						onclick={() => void downloads.openInDawn()}
						title="The stems as they are now, each on a track of a new Dawn song"
					>
						<span class="i-ph-sliders-horizontal mr-2" aria-hidden="true"></span>
						{downloads.openingInDawn ? "Loading into Dawn…" : "Open stems in Dawn"}
					</button>
				{/if}
			{/if}
			{#if docs.lyrics || docs.chart || docs.notes}
				<button
					class="block w-full rounded px-3 py-1.5 text-left hover:bg-white/10"
					type="button"
					role="menuitem"
					title="The lyrics, chart and notes as one PDF, with the notation after them"
					onclick={() =>
						downloadBuilt(
							`/api/songs/${song.id}/documentation.pdf`,
							"the documentation PDF",
							`${song.title}.pdf`,
						)}
				>
					<span class="i-ph-file-pdf mr-2" aria-hidden="true"></span>
					Song Documentation (PDF)
				</button>
			{/if}
			{#if readyDemos.length > 0}
				<button
					class="block w-full rounded px-3 py-1.5 text-left hover:bg-white/10"
					type="button"
					role="menuitem"
					onclick={onshowdemos}
					title="Show the demo recordings in the player"
				>
					<span class="i-ph-microphone mr-2" aria-hidden="true"></span>
					Demos ({readyDemos.length})
				</button>
			{/if}
		</div>
	</details>
{/snippet}
