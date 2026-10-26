<script lang="ts">
	import { formatTime } from "#lib/utils/formatTime.js";
	import { isTextEntry } from "#lib/utils/isTextEntry.js";
	import {
		createPlaybackEq,
		DEFAULT_PLAYBACK_EQ,
		isFlat,
		type PlaybackEq,
		type PlaybackEqSettings,
	} from "#lib/audio/playbackEq.js";
	import { playThroughSilentSwitch } from "#lib/audio/playThroughSilentSwitch.js";
	import { EQ_BANDS } from "#lib/constants/playbackEq.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { downloadBuilt } from "#lib/utils/downloadBuilt.js";
	import { eqSearchParams } from "#lib/utils/eqSearchParams.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";
	import { clearPlaybackEq, loadPlaybackEq, savePlaybackEq } from "#lib/utils/playbackEqStorage.js";
	import { onDestroy, onMount, tick, untrack } from "svelte";
	import SessionEqPanel from "./SessionEqPanel.svelte";

	/** One recording as the player plays it: the MP3 when it has rendered, else the file as uploaded. */
	export interface SessionTrack {
		id: string;
		title: string;
		url: string;
		/** The session's name, under the title. */
		session: string;
		/** The session's id: the EQ is remembered per session. */
		sessionId: string;
		/** The session's shared EQ (saved for everyone in the account), or null. */
		sessionEq: PlaybackEqSettings | null;
	}

	/**
	 * The Sessions page's player (docs/uploads-and-blob.md, "Sessions"), in
	 * the project page's shape: one queue of recordings (a session's, in
	 * the order they were made), previous and next, the position and the
	 * volume. A row's play button or a session's Play all fills the queue
	 * and starts a track; the same track toggles. A loop, as the stem
	 * player's (docs/stem-engine.md, "Loop"): a stretch selected by a drag
	 * across the recording's waveform (`setLoop`), or the whole recording,
	 * played round while Loop is on (L); Escape clears the selection. A
	 * playback EQ (EQ button): the element runs through Web Audio
	 * (`playbackEq.ts`) once the first play gives the context its gesture;
	 * the settings are remembered per session on the device
	 * (`playbackEqStorage.ts`) and follow the track: a session plays with
	 * the device's own EQ for it, else the session's shared one (a member's
	 * Save for everyone), else flat.
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
		/** A member: may save the EQ for everyone in the account. */
		canEdit?: boolean;
		/** Persist a session's shared EQ (null removes it); resolves to what is shared now. */
		onsaveshared?: (
			sessionId: string,
			eq: PlaybackEqSettings | null,
		) => Promise<PlaybackEqSettings | null>;
	}
	let {
		queue,
		current = $bindable(null),
		paused = $bindable(true),
		currentTime = $bindable(0),
		duration = $bindable(0),
		loop = $bindable(null),
		looping = $bindable(false),
		canEdit = false,
		onsaveshared,
	}: Props = $props();

	let track = $derived(queue.find((t) => t.id === current) ?? null);
	let index = $derived(track ? queue.indexOf(track) : -1);
	let audio = $state<HTMLAudioElement | null>(null);
	// 70% to start: a leveled recording at full scale is loud on a laptop's speakers.
	let volume = $state(0.7);

	// The playback EQ, per session. Flat until mount (the server has no device storage); then the
	// current track's session's, applied again whenever a track of another session starts (`play`).
	const uid = $props.id();
	const eqPanelId = `session-eq-${uid}`;
	let eq = $state<PlaybackEqSettings>({ ...DEFAULT_PLAYBACK_EQ });
	let eqActive = $derived(!isFlat(eq));
	/** Whether the device has its own EQ saved for the current track's session. */
	let ownEq = $state(false);
	/** The session whose EQ `eq` is; a track of the same session keeps it. */
	let eqSession: string | null = null;
	/** Shared EQs saved or removed here, ahead of the page's data. */
	let sharedOverrides = $state<Record<string, PlaybackEqSettings | null>>({});
	const sharedOf = (t: SessionTrack) =>
		t.sessionId in sharedOverrides ? sharedOverrides[t.sessionId] : t.sessionEq;
	let shared = $derived(track ? sharedOf(track) : null);
	let sharedMatches = $derived(!!shared && sameEq(eq, shared));
	let eqStatus = $derived(
		ownEq ? "Your EQ for this session" : shared ? "The session's shared EQ" : "Flat",
	);
	function sameEq(a: PlaybackEqSettings, b: PlaybackEqSettings) {
		return (
			a.highPass === b.highPass &&
			EQ_BANDS.every((k) => a[k].gain === b[k].gain && a[k].freq === b[k].freq)
		);
	}
	/** Switch to the track's session's EQ: the device's own, else the shared one, else flat. */
	function applySessionEq(t: SessionTrack | null) {
		if (!t || t.sessionId === eqSession) return;
		eqSession = t.sessionId;
		const own = loadPlaybackEq(t.sessionId);
		ownEq = own !== null;
		eq = own ?? $state.snapshot(sharedOf(t) ?? DEFAULT_PLAYBACK_EQ);
		graph?.eq.update(eq);
	}
	onMount(() => applySessionEq(track));
	/** The context, made on the first play (a gesture, which iOS needs); null where Web Audio is missing. */
	let ctx: AudioContext | null = null;
	/** The element on the page now, and its graph once wired (a media element gets one source, ever). */
	let element: HTMLAudioElement | null = null;
	let graph: { source: MediaElementAudioSourceNode; eq: PlaybackEq } | null = null;

	/** Route the current element through the EQ, once per element; on failure it plays as it is. */
	function wire() {
		if (!ctx || !element || graph) return;
		try {
			const source = ctx.createMediaElementSource(element);
			const chain = createPlaybackEq(ctx, eq);
			source.connect(chain.input);
			chain.output.connect(ctx.destination);
			graph = { source, eq: chain };
		} catch {
			// No MediaElementAudioSourceNode here: the element keeps its own output.
		}
	}
	/**
	 * Called inside the gesture that starts playback: make or wake the context,
	 * then wire the element. Through Web Audio the sound falls under iOS's
	 * ring/silent switch, which a plain media element does not, so the
	 * media rules are asked for on the same gesture (docs/audio-engine.md
	 * "iOS and the ring/silent switch"), as the stem engine does.
	 */
	function ensureAudio() {
		if (!ctx) {
			const Ctor = globalThis.AudioContext;
			if (typeof Ctor !== "function") return;
			try {
				ctx = new Ctor();
			} catch {
				return;
			}
		}
		playThroughSilentSwitch();
		wakeAudio();
		wire();
	}
	/** Resume the context; iOS can also leave it "interrupted" (a call, another app's audio), so the element's play wakes it too. */
	function wakeAudio() {
		if (ctx && ctx.state !== "running") void ctx.resume().catch(() => {});
	}
	/**
	 * The `<audio>` element's attachment: a new element (the queue emptied
	 * and refilled) gets its own graph. Untracked: an attachment re-runs
	 * when state it read changes, and `wire` reads the EQ settings; a
	 * re-run would tear down the element's one allowed source node and
	 * fail to make another, leaving the element routed to nothing (Kevin,
	 * 2026-10-26: moving a slider while playing silenced the session for
	 * good). Changes reach the graph through `setEq` instead.
	 */
	function eqAttachment(el: HTMLAudioElement) {
		element = el;
		untrack(wire);
		return () => {
			if (graph) {
				graph.source.disconnect();
				graph.eq.output.disconnect();
				graph = null;
			}
			if (element === el) element = null;
		};
	}
	onDestroy(() => {
		void ctx?.close().catch(() => {});
		ctx = null;
	});
	function setEq(next: PlaybackEqSettings) {
		eq = next;
		graph?.eq.update(next);
		if (!track) return; // nothing playing: a trial for the next session's first track to replace
		savePlaybackEq(track.sessionId, next);
		ownEq = true;
	}
	/** Forget the device's EQ for the session: back to the shared one, or flat. */
	function resetEq() {
		if (track) clearPlaybackEq(track.sessionId);
		ownEq = false;
		eq = $state.snapshot((track && sharedOf(track)) ?? DEFAULT_PLAYBACK_EQ);
		graph?.eq.update(eq);
	}
	/** Save (or, with null, remove) the session's shared EQ; the device then follows the shared one. */
	async function saveShared(next: PlaybackEqSettings | null) {
		const t = track;
		if (!t || !onsaveshared) return;
		try {
			const saved = await onsaveshared(t.sessionId, next);
			sharedOverrides[t.sessionId] = saved;
			if (next) {
				clearPlaybackEq(t.sessionId);
				if (track?.sessionId === t.sessionId) ownEq = false;
				notify("EQ saved for everyone in the account");
			} else {
				if (track?.sessionId === t.sessionId && !ownEq) {
					eq = { ...DEFAULT_PLAYBACK_EQ };
					graph?.eq.update(eq);
				}
				notify("Shared EQ removed");
			}
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
		}
	}
	function downloadWithEq() {
		if (!track || isFlat(eq)) return;
		void downloadBuilt(
			`/api/sessions/${track.id}/eq.mp3?${eqSearchParams(eq)}`,
			"MP3 with EQ",
			`${track.title} (EQ).mp3`,
		);
	}
	export async function play(id: string) {
		ensureAudio();
		if (current === id) {
			toggle();
			return;
		}
		// The element is paused before its `src` swaps (a play still pending would be interrupted by
		// the new load and reject), then started once it has the new track; `paused` follows the element.
		audio?.pause();
		current = id;
		applySessionEq(queue.find((t) => t.id === id) ?? null);
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
		ensureAudio();
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
		{@attach eqAttachment}
		crossorigin="anonymous"
		src={track.url}
		bind:paused
		bind:currentTime
		bind:duration
		bind:volume
		{onended}
		{ontimeupdate}
		onplay={wakeAudio}
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
		<!-- The playback EQ: lit while it changes the sound. -->
		<button
			type="button"
			class="grid h-10 min-w-10 place-items-center rounded-lg border border-white/15 bg-white/5 px-2 text-sm font-600 transition-all hover-bg-white/10 hover-text-accent active:scale-95 data-[active=true]:border-accent data-[active=true]:bg-accent/20 data-[active=true]:text-accent"
			aria-label="EQ"
			title="Playback EQ: lit while it changes the sound"
			popovertarget={eqPanelId}
			data-active={eqActive}
		>
			EQ
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

<SessionEqPanel
	id={eqPanelId}
	settings={eq}
	onchange={setEq}
	status={track ? eqStatus : ""}
	canReset={ownEq || eqActive}
	canEdit={canEdit && !!onsaveshared}
	sharedMatches={!track || sharedMatches}
	hasShared={!!shared}
	downloadDisabled={!track || !eqActive}
	onreset={resetEq}
	onsaveshared={() => saveShared($state.snapshot(eq))}
	onremoveshared={() => saveShared(null)}
	ondownload={downloadWithEq}
/>
