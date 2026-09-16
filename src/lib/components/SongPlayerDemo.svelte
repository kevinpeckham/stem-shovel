<script lang="ts">
	import StemPlayer from "$lib/components/StemPlayer.svelte";
	import { type MixMode, mixQuery, saveMix, saveStemsZip } from "$lib/audio/downloads";
	import type { StemEngine } from "$lib/audio/engine.svelte";
	import type { StemState } from "$lib/audio/types";
	import type { SongView } from "$lib/server/songView";
	import { saveAs } from "$lib/upload";
	import { errorMessage } from "$lib/utils/errorMessage";
	import { formatBytes } from "$lib/utils/formatBytes";
	import { tick } from "svelte";

	/**
	 * The song page's player and download row for a visitor, as the home
	 * page's demo: transport, waveforms, mute/solo/faders, the stem downloads,
	 * both mixes, the zip of stems and the demo recordings. Nothing here edits.
	 */
	interface Props {
		view: SongView;
		/** The song's own page. */
		href: string;
	}
	let { view, href }: Props = $props();
	let song = $derived(view.song);
	let ready = $derived(song.stems.filter((s) => s.status === "ready" && s.url));
	let readyDemos = $derived(song.demos.filter((d) => d.status === "ready"));
	let stemRows = $derived(new Map(song.stems.map((s) => [s.id, s])));
	let engine = $state<StemEngine | null>(null);
	let mixing = $state<MixMode | null>(null);
	let mixError = $state<string | null>(null);
	let zipping = $state<string | null>(null);
	/** `project-song-v1.2.3`: every download names the song version it was made from. */
	let name = $derived(`${song.project.slug}-${song.slug}-v${song.version}`);

	async function downloadMix(mode: MixMode) {
		if (mixing) return;
		mixError = null;
		const query = mixQuery(mode, engine);
		if (query === null) {
			mixError = "Nothing is audible — unmute a stem first.";
			return;
		}
		mixing = mode;
		try {
			await saveMix(song.id, name, mode, query);
		} catch (e) {
			mixError = errorMessage(e);
		} finally {
			mixing = null;
		}
	}
	async function downloadAll() {
		if (ready.length === 0 || zipping) return;
		zipping = "Preparing…";
		try {
			await saveStemsZip(ready, name);
		} catch (e) {
			mixError = errorMessage(e);
		} finally {
			zipping = null;
		}
	}

	// Demo recordings: one <audio>, the chosen demo's rendition.
	let demoPlaying = $state<string | null>(null);
	let demoPaused = $state(true);
	let demoAudio = $state<HTMLAudioElement | null>(null);
	let demoTrack = $derived(readyDemos.find((d) => d.id === demoPlaying) ?? null);
	async function playDemo(id: string) {
		if (demoPlaying === id) {
			demoPaused = !demoPaused;
			return;
		}
		demoPlaying = id;
		await tick();
		demoPaused = false;
	}
</script>

<div class="grid gap-3">
	<div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
		<h3 class="text-18px font-700">
			<a class="hover:text-maximumYellow" {href}>{song.title}</a>
			<span class="ml-2 text-13px font-400 opacity-70">v{song.version} · {song.project.name}</span>
		</h3>
		<a class="text-13px link-dim" {href}>Open the song page →</a>
	</div>
	{#if view.manifest.stems.length > 0}
		<StemPlayer
			manifest={view.manifest}
			{stemMenu}
			sections={song.sections}
			changes={song.changes}
			startAt={song.startAt}
			endAt={song.endAt}
			fps={song.frameRate}
			onengine={(e) => (engine = e)}
		>
			{#snippet errorHint()}
				A stem's file could not be loaded.
			{/snippet}
		</StemPlayer>
	{:else}
		<p class="text-sm text-dim">No stems yet.</p>
	{/if}
	<div
		class="flex flex-wrap items-center gap-3 w-full border py-4 px-3 rounded-md border-current/40 bg-blue-300/5 text-15px"
	>
		{#if ready.length > 0}
			<button
				class="button button-sm lg-button-xs"
				type="button"
				disabled={!!zipping}
				onclick={downloadAll}
				title="Download all stems"
			>
				<span class="i-ph-download-simple" aria-hidden="true"></span>
				{zipping ?? "Download Stems"}
			</button>
			<button
				class="button button-sm lg-button-xs"
				type="button"
				disabled={!!mixing}
				onclick={() => downloadMix("original")}
				title="Download an MP3 of the full mix"
			>
				<span class="i-ph-download-simple" aria-hidden="true"></span>
				{mixing === "original" ? "Rendering…" : "Original Mix (MP3)"}
			</button>
			<button
				class="button button-sm lg-button-xs"
				type="button"
				disabled={!!mixing}
				onclick={() => downloadMix("custom")}
				title="Download an MP3 of what is audible now (mute, solo, faders)"
			>
				<span class="i-ph-download-simple" aria-hidden="true"></span>
				{mixing === "custom" ? "Rendering…" : "Custom Mix (MP3)"}
			</button>
		{/if}
		{#if readyDemos.length > 0}
			<button
				class="button button-sm lg-button-xs"
				type="button"
				popovertarget="demo-recordings"
				title="Listen to or download the demo recordings"
			>
				<span class="i-ph-microphone" aria-hidden="true"></span>
				Demos ({readyDemos.length})
			</button>
		{/if}
		{#if mixError}
			<p class="w-full text-sm text-red-400" role="alert">{mixError}</p>
		{/if}
	</div>
</div>

{#if readyDemos.length > 0}
	<div
		id="demo-recordings"
		popover="auto"
		class="m-auto max-h-[calc(100vh-2rem)] overflow-y-auto w-[min(32rem,calc(100vw-2rem))] rounded-md border border-white/15 bg-oxford p-6 text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/60"
	>
		<div class="mb-4 flex items-center justify-between gap-4">
			<h2 class="heading-2 mb-0">Demo recordings</h2>
			<button
				class="button button-xs"
				type="button"
				popovertarget="demo-recordings"
				popovertargetaction="hide"
			>
				Close
			</button>
		</div>
		{#if demoTrack}
			<!-- svelte-ignore a11y_media_has_caption -->
			<audio
				bind:this={demoAudio}
				src={demoTrack.playbackUrl ?? demoTrack.url}
				bind:paused={demoPaused}
				preload="auto"
				onended={() => (demoPaused = true)}
			></audio>
		{/if}
		<ul class="grid gap-2">
			{#each readyDemos as d (d.id)}
				<li class="flex items-center gap-3 rounded border border-white/10 px-3 py-2">
					<button
						type="button"
						class="grid h-9 w-9 shrink-0 place-items-center rounded bg-maximumYellow text-oxford active:scale-95"
						aria-label={demoPlaying === d.id && !demoPaused
							? `Pause ${d.label}`
							: `Play ${d.label}`}
						onclick={() => playDemo(d.id)}
					>
						<span
							class={demoPlaying === d.id && !demoPaused ? "i-ph-pause-fill" : "i-ph-play-fill"}
							aria-hidden="true"
						></span>
					</button>
					<span class="min-w-0 grow truncate">
						{d.label}
						<span class="block text-xs text-dim">{formatBytes(d.sizeBytes)}</span>
					</span>
					<button
						type="button"
						class="button button-xs"
						title={d.playbackUrl ? `Download ${d.label}.mp3` : `Download ${d.filename}`}
						onclick={() =>
							d.playbackUrl ? saveAs(d.playbackUrl, `${d.label}.mp3`) : saveAs(d.url, d.filename)}
					>
						<span class="i-ph-download-simple" aria-hidden="true"></span>
						Download
					</button>
				</li>
			{/each}
		</ul>
	</div>
{/if}

{#snippet stemMenu(stem: StemState)}
	{@const row = stemRows.get(stem.id)}
	{#if row}
		<details class="relative" data-stem-menu>
			<summary
				class="grid h-6 w-6 cursor-pointer list-none place-items-center rounded border border-white/10 text-lg leading-none hover:border-white/60 [&::-webkit-details-marker]:hidden"
				title="{stem.label}: options"
				aria-label="{stem.label}: options"
				><span class="i-ph-dots-three-bold" aria-hidden="true"></span></summary
			>
			<div
				class="absolute left-0 z-20 mt-1 w-56 rounded border border-white/15 bg-oxford-800 p-1 text-sm shadow-lg shadow-black/50"
			>
				<div class="truncate px-3 py-1.5 text-xs text-dim">
					{row.filename} · {formatBytes(row.sizeBytes)}
				</div>
				<button
					class="block w-full rounded px-3 py-1.5 text-left hover:bg-white/10"
					type="button"
					onclick={() => saveAs(row.url, row.filename)}
				>
					<span class="i-ph-download-simple mr-2" aria-hidden="true"></span>Download Stem
				</button>
				{#if row.midiUrl && row.midiFilename}
					<button
						class="block w-full rounded px-3 py-1.5 text-left hover:bg-white/10"
						type="button"
						onclick={() => saveAs(row.midiUrl ?? "", row.midiFilename ?? "stem.mid")}
					>
						<span class="i-ph-music-notes mr-2" aria-hidden="true"></span>Download MIDI
					</button>
				{/if}
			</div>
		</details>
	{/if}
{/snippet}
