<script lang="ts">
	import { formatTime } from "$lib/utils/formatTime";
	import { isTextEntry } from "$lib/utils/isTextEntry";
	import { tick } from "svelte";

	/** A song as the project page lists it; `mixUrl` is the cached original MP3, null until rendered. */
	export interface PlaylistSong {
		id: string;
		title: string;
		mixUrl: string | null;
	}

	interface Props {
		songs: PlaylistSong[];
		/** The song whose row button was pressed; the player exposes its own state back through `current`. */
		current?: string | null;
		paused?: boolean;
	}

	let { songs, current = $bindable(null), paused = $bindable(true) }: Props = $props();

	let playable = $derived(songs.filter((s) => s.mixUrl));
	let track = $derived(playable.find((s) => s.id === current) ?? null);
	let index = $derived(track ? playable.indexOf(track) : -1);
	let audio = $state<HTMLAudioElement | null>(null);
	let currentTime = $state(0);
	let duration = $state(0);

	/** Play a song (from its row or the playlist); the same song toggles. */
	export async function play(id: string) {
		if (current === id) {
			paused = !paused;
			return;
		}
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
		{onended}
		preload="auto"
	></audio>
{/if}

<div class="surface px-4 py-3 flex flex-wrap items-center gap-4">
	<div class="flex items-center gap-2">
		<button
			type="button"
			class="grid h-10 w-10 place-items-center rounded-lg border border-white/15 bg-white/5 hover-bg-white/10 hover-text-accent active:scale-95 disabled:opacity-40"
			aria-label="Previous song"
			disabled={index <= 0}
			onclick={() => step(-1)}
		>
			<span class="i-ph-skip-back-fill" aria-hidden="true"></span>
		</button>
		<button
			type="button"
			class="grid h-12 w-12 place-items-center rounded-lg bg-maximumYellow text-oxford transition-all hover:shadow-lg hover:shadow-maximumYellow/30 active:scale-95 disabled:opacity-40"
			aria-label={paused ? "Play" : "Pause"}
			title={playable.length ? "Play the project's songs in order" : "No mixes rendered yet"}
			disabled={playable.length === 0}
			onclick={playAll}
		>
			<span class="{paused ? 'i-ph-play-fill' : 'i-ph-pause-fill'} text-20px" aria-hidden="true"
			></span>
		</button>
		<button
			type="button"
			class="grid h-10 w-10 place-items-center rounded-lg border border-white/15 bg-white/5 hover-bg-white/10 hover-text-accent active:scale-95 disabled:opacity-40"
			aria-label="Next song"
			disabled={index < 0 || index >= playable.length - 1}
			onclick={() => step(1)}
		>
			<span class="i-ph-skip-forward-fill" aria-hidden="true"></span>
		</button>
	</div>
	<div class="min-w-0 grow">
		{#if track}
			<p class="truncate font-500">{track.title}</p>
			<p class="text-sm text-dim tabular-nums">
				{formatTime(currentTime)} / {formatTime(duration)} · {index + 1} of {playable.length}
			</p>
		{:else if playable.length}
			<p class="text-dim">
				{playable.length}
				{playable.length === 1 ? "song" : "songs"} ready to play
			</p>
		{:else}
			<p class="text-dim">Mixes appear here once a song has stems.</p>
		{/if}
	</div>
	{#if track}
		<input
			type="range"
			class="w-full sm:w-56 accent-blue-300"
			min="0"
			max={duration || 0}
			step="0.1"
			value={currentTime}
			aria-label="Position"
			oninput={(e) => {
				if (audio) audio.currentTime = e.currentTarget.valueAsNumber;
			}}
		/>
	{/if}
</div>
