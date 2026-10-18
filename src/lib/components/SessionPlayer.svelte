<script lang="ts">
	import { formatTime } from "#lib/utils/formatTime.js";
	import { isTextEntry } from "#lib/utils/isTextEntry.js";
	import { tick } from "svelte";

	/** One recording as the player plays it: the MP3 when it has rendered, else the file as uploaded. */
	export interface SessionTrack {
		id: string;
		title: string;
		url: string;
		/** The session's name, under the title. */
		session: string;
	}

	/**
	 * The Sessions page's player (docs/uploads-and-blob.md, "Sessions"), in
	 * the project page's shape: one queue of recordings (a session's, in
	 * the order they were made), previous and next, the position and the
	 * volume. A row's play button or a session's Play all fills the queue
	 * and starts a track; the same track toggles.
	 */
	interface Props {
		queue: SessionTrack[];
		current?: string | null;
		paused?: boolean;
	}
	let { queue, current = $bindable(null), paused = $bindable(true) }: Props = $props();

	let track = $derived(queue.find((t) => t.id === current) ?? null);
	let index = $derived(track ? queue.indexOf(track) : -1);
	let audio = $state<HTMLAudioElement | null>(null);
	let currentTime = $state(0);
	let duration = $state(0);
	let volume = $state(1);

	export async function play(id: string) {
		if (current === id) {
			paused = !paused;
			return;
		}
		// Swapping `src` fires a pause event that flips the bound state: start the new track once the element has it.
		current = id;
		paused = false;
		await tick();
		await audio?.play().catch(() => {});
	}
	function playAll() {
		if (track) paused = !paused;
		else if (queue[0]) void play(queue[0].id);
	}
	function step(delta: number) {
		const next = queue[index + delta];
		if (next) void play(next.id);
	}
	function onended() {
		if (queue[index + 1]) step(1);
		else paused = true;
	}
	function seek(e: Event) {
		const at = Number((e.currentTarget as HTMLInputElement).value);
		if (audio) audio.currentTime = at;
		currentTime = at;
	}
	// Space toggles the player as the song transport does; Home rewinds.
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
		src={track.url}
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
	data-session-player
>
	<div class="flex items-center gap-2">
		<button
			type="button"
			class="grid h-10 w-10 place-items-center rounded-lg border border-white/15 bg-white/5 hover-bg-white/10 hover-text-accent active:scale-95 disabled-opacity-60"
			aria-label="Previous recording"
			disabled={index <= 0}
			onclick={() => step(-1)}
		>
			<span class="i-ph-skip-back-fill" aria-hidden="true"></span>
		</button>
		<button
			type="button"
			class="grid h-12 w-12 place-items-center rounded-lg bg-accent text-oxford transition-all hover:shadow-lg hover:shadow-maximumYellow/30 active:scale-95 disabled:opacity-40"
			aria-label={paused ? "Play" : "Pause"}
			title={queue.length
				? "Play the session's recordings in order"
				: "Press Play all on a session"}
			disabled={queue.length === 0}
			onclick={playAll}
		>
			<span class="{paused ? 'i-ph-play-fill' : 'i-ph-pause-fill'} text-20px" aria-hidden="true"
			></span>
		</button>
		<button
			type="button"
			class="grid h-10 w-10 place-items-center rounded-lg border border-white/15 bg-white/5 hover-bg-white/10 hover-text-accent active:scale-95 disabled-opacity-60"
			aria-label="Next recording"
			disabled={index < 0 || index >= queue.length - 1}
			onclick={() => step(1)}
		>
			<span class="i-ph-skip-forward-fill" aria-hidden="true"></span>
		</button>
	</div>
	<div class="min-w-0 grow">
		{#if track}
			<p class="truncate font-500">{track.title}</p>
			<p class="truncate text-sm text-dim tabular-nums">
				{track.session} · {formatTime(currentTime)} / {formatTime(duration)} · {index + 1} of {queue.length}
			</p>
		{:else if queue.length}
			<p class="text-dim">
				{queue.length}
				{queue.length === 1 ? "recording" : "recordings"} ready to play
			</p>
		{:else}
			<p class="text-dim">Play a recording, or a whole session, from the list below.</p>
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
