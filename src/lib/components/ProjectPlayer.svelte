<script lang="ts">
	import { formatTime } from "#lib/utils/formatTime.js";
	import { isTextEntry } from "#lib/utils/isTextEntry.js";
	import { onMount, tick } from "svelte";

	/** A song as the project page lists it; `mixUrl` is the cached original MP3, null until rendered. A demo track is the same shape, its id the demo's. */
	export interface PlaylistSong {
		id: string;
		title: string;
		mixUrl: string | null;
		/** A demo track of a song with no stems yet (a song idea): the demos playlist's default scope (Kevin). */
		idea?: boolean;
		/** What the track is, beside its title ("Mix v4", "Stems mix"), so the listener knows what they hear (docs/mixes.md). */
		source?: string;
	}
	export type PlaylistMode = "mixes" | "demos";

	interface Props {
		songs: PlaylistSong[];
		/** The songs' demo recordings as tracks, in the songs' order (Kevin: a second playlist on its own tab). */
		demos?: PlaylistSong[];
		/** The song whose row button was pressed; the player exposes its own state back through `current`. */
		current?: string | null;
		paused?: boolean;
	}

	let { songs, demos = [], current = $bindable(null), paused = $bindable(true) }: Props = $props();

	// The tab: the mixes when any song has one, else the demos (Kevin); a choice sticks for the page.
	let chosen = $state<PlaylistMode | null>(null);
	let mode = $derived(chosen ?? (songs.some((s) => s.mixUrl) ? "mixes" : "demos"));
	let mixCount = $derived(songs.filter((s) => s.mixUrl).length);
	// The demos of the song ideas, as the page's Song Ideas section, unless every song's are wanted; remembered per browser.
	let allDemos = $state(false);
	const ALL_DEMOS_KEY = "stemshovel.project.all-demos";
	function setAllDemos(on: boolean) {
		allDemos = on;
		current = null;
		paused = true;
		try {
			localStorage.setItem(ALL_DEMOS_KEY, on ? "1" : "0");
		} catch {
			// Private mode: the choice lasts for this page only.
		}
	}
	onMount(() => {
		try {
			allDemos = localStorage.getItem(ALL_DEMOS_KEY) === "1";
		} catch {
			// As above.
		}
	});
	let demoList = $derived(demos.filter((d) => allDemos || d.idea));
	let demoCount = $derived(demoList.filter((d) => d.mixUrl).length);
	function setMode(next: PlaylistMode) {
		if (next === mode) return;
		chosen = next;
		current = null;
		paused = true;
	}
	let playable = $derived((mode === "demos" ? demoList : songs).filter((s) => s.mixUrl));
	let track = $derived(playable.find((s) => s.id === current) ?? null);
	let index = $derived(track ? playable.indexOf(track) : -1);
	let audio = $state<HTMLAudioElement | null>(null);
	let currentTime = $state(0);
	let duration = $state(0);
	/** The playlist's own volume (0..1), kept across tracks. */
	let volume = $state(1);

	/** Play a song (from its row or the playlist); the same song toggles. A row's song is a mix: that tab comes first. */
	export async function play(id: string) {
		if (current === id) {
			paused = !paused;
			return;
		}
		if (mode === "demos" && songs.some((s) => s.id === id)) chosen = "mixes";
		else if (mode === "mixes" && demos.some((d) => d.id === id)) chosen = "demos";
		// Swapping `src` fires a pause event that flips the bound state, so start
		// the new track explicitly once the element has it.
		current = id;
		paused = false;
		await tick();
		await audio?.play().catch(() => {});
	}

	function playAll() {
		if (track) paused = !paused;
		else if (playable[0]) play(playable[0].id);
	}

	function step(delta: number) {
		const next = playable[index + delta];
		if (next) play(next.id);
	}

	function onended() {
		if (playable[index + 1]) step(1);
		else paused = true;
	}
	function seek(e: Event) {
		const at = Number((e.currentTarget as HTMLInputElement).value);
		if (audio) audio.currentTime = at;
		currentTime = at;
	}

	// Space toggles the playlist like the song transport; Home rewinds.
	function onwindowkeydown(e: KeyboardEvent) {
		if (e.metaKey || e.ctrlKey || e.altKey || isTextEntry(e.target)) return;
		if (e.key === " ") {
			e.preventDefault();
			if (!e.repeat) playAll();
		} else if (e.key === "Home" && audio) {
			e.preventDefault();
			audio.currentTime = 0;
		}
	}
	function onwindowkeyup(e: KeyboardEvent) {
		if (e.key === " " && !isTextEntry(e.target)) e.preventDefault();
	}
</script>

<svelte:window onkeydown={onwindowkeydown} onkeyup={onwindowkeyup} />

{#if track}
	<!-- svelte-ignore a11y_media_has_caption -->
	<audio
		bind:this={audio}
		src={track.mixUrl}
		bind:paused
		bind:currentTime
		bind:duration
		bind:volume
		{onended}
		preload="auto"
	></audio>
{/if}

<div
	class="bg-blue-300/5 border border-current/40 rounded-md px-4 py-3 flex flex-wrap items-center gap-4"
>
	<!-- The two playlists: the songs' mixes, or their demo recordings. -->
	<div
		class="flex overflow-hidden rounded border border-white/15 items-center w-full sm:w-auto"
		role="tablist"
		aria-label="Playlist"
	>
		{#each [{ id: "mixes", label: `Mixes (${mixCount})` }, { id: "demos", label: `Demos (${demoCount})` }] as tab, index (tab.id)}
			<button
				type="button"
				role="tab"
				aria-selected={mode === tab.id}
				class="{mode === tab.id
					? 'button button-xs bg-blue-300 text-oxford border-blue-300 hover-bg-blue-200 hover-border-blue-200'
					: 'button button-xs opacity-80 hover-bg-blue-200 hover-border-blue-200'} {index === 0
					? 'rounded-r-none border-r-none'
					: 'rounded-l-none'}"
				onclick={() => setMode(tab.id as PlaylistMode)}>{tab.label}</button
			>
		{/each}
	</div>
	{#if mode === "demos"}
		<label
			class="flex items-center gap-2 text-sm text-dim cursor-pointer"
			title="Every song's demos, or only those of songs without stems (the Song Ideas below)"
		>
			<input
				type="checkbox"
				class="accent-maximumYellow"
				checked={allDemos}
				onchange={(e) => setAllDemos(e.currentTarget.checked)}
			/>
			All demos
		</label>
	{/if}
	<div class="flex items-center gap-2">
		<button
			type="button"
			class="grid h-10 w-10 place-items-center rounded-lg border border-white/15 bg-white/5 hover-bg-white/10 hover-text-accent active:scale-95 disabled-opacity-60"
			aria-label="Previous song"
			disabled={index <= 0}
			onclick={() => step(-1)}
		>
			<span class="i-ph-skip-back-fill" aria-hidden="true"></span>
		</button>
		<button
			type="button"
			class="grid h-12 w-12 place-items-center rounded-lg bg-accent text-oxford transition-all hover:shadow-lg hover:shadow-maximumYellow/30 active:scale-95 disabled:opacity-40"
			aria-label={paused ? "Play" : "Pause"}
			title={playable.length
				? mode === "demos"
					? "Play the songs' demos in order"
					: "Play the project's songs in order"
				: mode === "demos"
					? "No demo recordings yet"
					: "No mixes rendered yet"}
			disabled={playable.length === 0}
			onclick={playAll}
		>
			<span class="{paused ? 'i-ph-play-fill' : 'i-ph-pause-fill'} text-20px" aria-hidden="true"
			></span>
		</button>
		<button
			type="button"
			class="grid h-10 w-10 place-items-center rounded-lg border border-white/15 bg-white/5 hover-bg-white/10 hover-text-accent active:scale-95 disabled-opacity-60"
			aria-label="Next song"
			disabled={index < 0 || index >= playable.length - 1}
			onclick={() => step(1)}
		>
			<span class="i-ph-skip-forward-fill" aria-hidden="true"></span>
		</button>
	</div>
	<div class="min-w-0 grow">
		{#if track}
			<p class="truncate font-500">
				{track.title}{#if track.source}
					<span class="ml-2 rounded border border-current/30 px-1 text-11px font-400 align-middle"
						>{track.source}</span
					>{/if}
			</p>
			<p class="text-sm text-dim tabular-nums">
				{formatTime(currentTime)} / {formatTime(duration)} · {index + 1} of {playable.length}
			</p>
		{:else if playable.length}
			<p class="text-dim">
				{playable.length}
				{mode === "demos"
					? playable.length === 1
						? "demo"
						: "demos"
					: playable.length === 1
						? "song"
						: "songs"} ready to play
			</p>
		{:else if mode === "demos"}
			<p class="text-dim">
				{allDemos || demos.length === 0
					? "Demos appear here once a song has a recording."
					: "No song idea has a demo yet; All demos plays every song's."}
			</p>
		{:else}
			<p class="text-dim">Mixes appear here once a song has stems.</p>
		{/if}
	</div>
	<label class="flex items-center gap-2 text-sm text-dim w-full sm:w-auto">
		<span class="i-ph-speaker-high" aria-hidden="true"></span>
		<span class="sr-only">Volume</span>
		<input
			type="range"
			class="w-full sm:w-40 accent-blue-300"
			min="0"
			max="1"
			step="0.01"
			bind:value={volume}
			aria-label="Volume"
		/>
	</label>
	<!-- Where playback is in the song; drag to seek. -->
	<input
		type="range"
		class="w-full accent-maximumYellow disabled:opacity-40"
		min="0"
		max={duration || 0}
		step="0.1"
		value={currentTime}
		disabled={!track || !duration}
		oninput={seek}
		aria-label="Position"
		aria-valuetext="{formatTime(currentTime)} of {formatTime(duration)}"
	/>
</div>
