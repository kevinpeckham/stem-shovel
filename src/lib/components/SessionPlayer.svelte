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
	 * and starts a track; the same track toggles. A loop, as the stem
	 * player's (docs/stem-engine.md, "Loop"): a stretch selected by a drag
	 * across the recording's waveform (`setLoop`), or the whole recording,
	 * played round while Loop is on (L); Escape clears the selection.
	 */
	interface Props {
		queue: SessionTrack[];
		current?: string | null;
		paused?: boolean;
		/** The playhead and the length of the current track, for a recording's review row (RecordingReview). */
		currentTime?: number;
		duration?: number;
		/** The selected stretch of the current track, in seconds, and whether it plays round. */
		loop?: { start: number; end: number } | null;
		looping?: boolean;
	}
	let {
		queue,
		current = $bindable(null),
		paused = $bindable(true),
		currentTime = $bindable(0),
		duration = $bindable(0),
		loop = $bindable(null),
		looping = $bindable(false),
	}: Props = $props();

	let track = $derived(queue.find((t) => t.id === current) ?? null);
	let index = $derived(track ? queue.indexOf(track) : -1);
	let audio = $state<HTMLAudioElement | null>(null);
	let volume = $state(1);

	export async function play(id: string) {
		if (current === id) {
			toggle();
			return;
		}
		// The element is paused before its `src` swaps (a play still pending would be interrupted by
		// the new load and reject), then started once it has the new track; `paused` follows the element.
		audio?.pause();
		current = id;
		loop = null; // the selection was the old track's
		await tick();
		await audio?.play().catch(() => {});
	}
	/** Select a stretch of the current track (a drag across its waveform); null clears it. Turned on outside it, playback goes to its start. */
	export function setLoop(region: { start: number; end: number } | null) {
		loop =
			region && region.end - region.start > 0.05
				? { start: Math.max(0, region.start), end: region.end }
				: null;
		if (
			looping &&
			loop &&
			audio &&
			(audio.currentTime < loop.start || audio.currentTime >= loop.end)
		)
			seekTo(loop.start);
	}
	export function toggleLooping() {
		looping = !looping;
		if (
			looping &&
			loop &&
			audio &&
			(audio.currentTime < loop.start || audio.currentTime >= loop.end)
		)
			seekTo(loop.start);
	}
	/** The loop's turn: past the selection's end, back to its start (the whole recording repeats from `onended`). */
	function ontimeupdate() {
		if (!looping || !loop || !audio) return;
		if (audio.currentTime >= loop.end) seekTo(loop.start);
	}
	function toggle() {
		if (!audio) return;
		if (audio.paused) void audio.play().catch(() => {});
		else audio.pause();
	}
	function playAll() {
		if (track) toggle();
		else if (queue[0]) void play(queue[0].id);
	}
	function step(delta: number) {
		const next = queue[index + delta];
		if (next) void play(next.id);
	}
	function onended() {
		if (looping && audio) {
			seekTo(loop?.start ?? 0);
			void audio.play().catch(() => {});
			return;
		}
		if (queue[index + 1]) step(1);
		else paused = true;
	}
	function seek(e: Event) {
		seekTo(Number((e.currentTarget as HTMLInputElement).value));
	}
	/** A comment's Go to, the review row's waveform and the page's menu: the current track to a moment. */
	export function seekTo(seconds: number) {
		const at = Math.max(0, duration ? Math.min(seconds, duration) : seconds);
		if (audio) audio.currentTime = at;
		currentTime = at;
	}
	/** Where the current track is, for the comment form's Playhead button. */
	export function currentPosition() {
		return currentTime;
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
		} else if ((e.key === "l" || e.key === "L") && track) {
			e.preventDefault();
			if (!e.repeat) toggleLooping();
		} else if (e.key === "Escape" && loop) {
			loop = null;
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
		{ontimeupdate}
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
		<!-- Loop the selection (a drag across the recording's waveform), or the whole recording when nothing is selected. -->
		<button
			type="button"
			class="grid h-10 w-10 place-items-center rounded-lg border transition-all active:scale-95 disabled-opacity-40 {looping
				? 'border-accent bg-accent/20 text-accent'
				: 'border-white/15 bg-white/5 hover-bg-white/10 hover-text-accent'}"
			aria-label="Loop"
			aria-pressed={looping}
			title={loop
				? `Loop the selection (L)${looping ? ": on" : ""} · Escape clears the selection`
				: `Loop the whole recording (L)${looping ? ": on" : ""} · drag across the waveform to loop part of it`}
			disabled={!track}
			onclick={toggleLooping}
		>
			<span class="i-ph-repeat text-20px" aria-hidden="true"></span>
		</button>
	</div>
	<div class="min-w-0 grow">
		{#if track}
			<p class="truncate font-500">{track.title}</p>
			<p class="truncate text-sm text-dim tabular-nums">
				{track.session} · {formatTime(currentTime)} / {formatTime(duration)} · {index + 1} of {queue.length}{#if loop}
					· loop {formatTime(loop.start)}–{formatTime(loop.end)}{/if}
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
