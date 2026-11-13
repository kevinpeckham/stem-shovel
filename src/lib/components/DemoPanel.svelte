<script lang="ts">
	import { DEMO_DEFAULT_VOLUME } from "#lib/constants/demoFormats.js";
	import RecordingReview, { type ReviewComment } from "#lib/components/RecordingReview.svelte";
	import DemoRowMenu from "#lib/components/DemoRowMenu.svelte";
	import DemoTileText from "#lib/components/DemoTileText.svelte";
	import { demoTileCounts } from "#lib/utils/demoTileCounts.js";
	import { formatTime } from "#lib/utils/formatTime.js";
	import { saveAs } from "#lib/upload.js";
	import { demoMenuItems } from "#lib/utils/demoMenuItems.js";
	import { tick, type Snippet } from "svelte";

	/**
	 * The song page's demos view, sharing the player's box with the stem
	 * player: a transport (previous, play/pause, next, seek, volume) over the
	 * list of demo recordings, each with its own play button and a ⋯ menu
	 * holding its own page (and, for an editor, Share… there) and its downloads.
	 * The page decides which view shows; `pause()` lets it quiet this one
	 * when the stems take over. Under the transport, the current demo's
	 * review (RecordingReview, docs/uploads-and-blob.md "Sessions" review):
	 * its waveform and its comments, through the page's card and menu; the
	 * other tiles their comment count and a bubble of the new ones (`onseen`).
	 */
	export interface PanelDemo {
		id: string;
		label: string;
		url: string;
		playbackUrl: string | null;
		filename: string;
		sizeBytes: number;
		/** Measured in the jobs function after the MP3; null until then. */
		peaks?: number[] | null;
		durationSeconds?: number | null;
		/** What the uploader said about the take, typed at upload; "" for none. */
		notes?: string;
	}
	interface Props {
		demos: PanelDemo[];
		/** A demo's own page (the song page's `demoPath`): the row menu's Open page, and Share… for an editor. */
		hrefOf?: (id: string) => string;
		/** At least this tall (the stem player's box, so the page keeps its shape across the toggle). */
		minHeight?: number;
		/** An editor may remove a demo from its row's menu (Kevin: there was no way on a song with stems). */
		canEdit?: boolean;
		onremove?: (demo: PanelDemo) => Promise<void> | void;
		/** An editor changes a demo's notes from its row's menu: the page opens its one notes popover. */
		oneditnotes?: (demo: PanelDemo) => void;
		/** The demos' comments, every demo's together; the panel keeps the current demo's. */
		comments?: (ReviewComment & { demoId: string })[];
		canComment?: boolean;
		/** The comment card for the review's bubbles and list (the page's, with its forms). */
		card?: Snippet<[string]>;
		/** Comment on the current demo in general (the review heading's button). */
		oncomment?: (demo: PanelDemo) => void;
		/** ⌘-click, Ctrl-click or right-click on the waveform: the page's menu (Seek here, Comment here). */
		oncontext?: (demo: PanelDemo, seconds: number, x: number, y: number) => void;
		/** New comments per demo id for the signed-in person: the bubble on a tile that is not open. */
		newComments?: Record<string, number>;
		/** A demo with new comments became the current one (selected, played, or opened by ?demo=): they are seen. */
		onseen?: (demo: { id: string }) => void;
	}
	let {
		demos,
		hrefOf,
		minHeight = 0,
		canEdit = false,
		onremove,
		oneditnotes,
		comments = [],
		canComment = false,
		card,
		oncomment,
		oncontext,
		newComments = {},
		onseen,
	}: Props = $props();

	let current = $state<string | null>(null);
	let paused = $state(true);
	let track = $derived(demos.find((d) => d.id === current) ?? null);
	let index = $derived(track ? demos.indexOf(track) : -1);
	let trackComments = $derived(track ? comments.filter((c) => c.demoId === track.id) : []);
	let tileCounts = $derived(demoTileCounts(demos, comments, newComments, current));
	let audio = $state<HTMLAudioElement | null>(null);
	let currentTime = $state(0);
	let duration = $state(0);
	let volume = $state(DEMO_DEFAULT_VOLUME);

	/** The demo shown above the list from now on; its new comments are seen. */
	function makeCurrent(id: string) {
		current = id;
		if ((newComments[id] ?? 0) > 0) onseen?.({ id });
	}
	/** Play a demo (from its row or the transport); the same demo toggles. */
	export async function play(id: string) {
		if (current === id) {
			paused = !paused;
			return;
		}
		// Swapping `src` fires a pause event that flips the bound state, so start
		// the new track explicitly once the element has it.
		makeCurrent(id);
		paused = false;
		await tick();
		await audio?.play().catch(() => {});
	}
	export function pause() {
		paused = true;
	}
	/** Show a demo (a notification's link, ?demo=) without starting it. */
	export function show(id: string) {
		if (demos.some((d) => d.id === id)) makeCurrent(id);
	}
	/** The page's menu (Seek here) and a comment's Go to. */
	export function seekTo(seconds: number) {
		const at = Math.max(0, duration ? Math.min(seconds, duration) : seconds);
		if (audio) audio.currentTime = at;
		currentTime = at;
	}
	/** Where the demo is playing, for the page's comment form (its Playhead button). */
	export function currentPosition() {
		return currentTime;
	}
	function playAll() {
		if (track) paused = !paused;
		else if (demos[0]) void play(demos[0].id);
	}
	function step(delta: number) {
		const next = demos[index + delta];
		if (next) void play(next.id);
	}
	function onended() {
		if (demos[index + 1]) step(1);
		else paused = true;
	}
	/** A row's ⋯ menu (demoMenuItems): Edit notes… asks the page for its notes popover; Remove quiets the demo first when it is the one playing. */
	const rowItems = (d: PanelDemo) =>
		demoMenuItems(d, {
			hrefOf,
			canEdit,
			save: saveAs,
			editNotes: oneditnotes && (() => oneditnotes(d)),
			remove:
				onremove &&
				(() => {
					if (current === d.id) pause();
					void onremove(d);
				}),
		});
	function seek(e: Event) {
		const at = Number((e.currentTarget as HTMLInputElement).value);
		if (audio) audio.currentTime = at;
		currentTime = at;
	}
</script>

{#if track}
	<!-- svelte-ignore a11y_media_has_caption -->
	<audio
		bind:this={audio}
		src={track.playbackUrl ?? track.url}
		bind:paused
		bind:currentTime
		bind:duration
		bind:volume
		{onended}
		preload="auto"
	></audio>
{/if}

<div
	class="rounded-md border border-current/40 bg-blue/5 px-4 py-3 grid gap-4 content-start"
	style:min-height={minHeight ? `${minHeight}px` : undefined}
	aria-label="Demo recordings"
>
	<div class="flex flex-wrap items-center gap-4">
		<div class="flex items-center gap-2">
			<button
				type="button"
				class="grid h-10 w-10 place-items-center rounded-lg border border-white/15 bg-white/5 hover-bg-white/10 hover-text-accent active:scale-95 disabled:opacity-40"
				aria-label="Previous demo"
				disabled={index <= 0}
				onclick={() => step(-1)}
			>
				<span class="i-ph-skip-back-fill" aria-hidden="true"></span>
			</button>
			<button
				type="button"
				class="grid h-12 w-12 place-items-center rounded-lg bg-accent text-oxford transition-all hover:shadow-lg hover:shadow-maximumYellow/30 active:scale-95 disabled:opacity-40"
				aria-label={paused ? "Play" : "Pause"}
				title={demos.length ? "Play the demos in order" : "No demos yet"}
				disabled={demos.length === 0}
				onclick={playAll}
			>
				<span class="{paused ? 'i-ph-play-fill' : 'i-ph-pause-fill'} text-20px" aria-hidden="true"
				></span>
			</button>
			<button
				type="button"
				class="grid h-10 w-10 place-items-center rounded-lg border border-white/15 bg-white/5 hover-bg-white/10 hover-text-accent active:scale-95 disabled:opacity-40"
				aria-label="Next demo"
				disabled={index < 0 || index >= demos.length - 1}
				onclick={() => step(1)}
			>
				<span class="i-ph-skip-forward-fill" aria-hidden="true"></span>
			</button>
		</div>
		<div class="min-w-0 grow">
			{#if track}
				<p class="truncate font-500">{track.label}</p>
				<p class="text-sm text-dim tabular-nums">
					{formatTime(currentTime)} / {formatTime(duration)} · {index + 1} of {demos.length}
				</p>
			{:else if demos.length}
				<p class="text-dim">
					{demos.length}
					{demos.length === 1 ? "demo recording" : "demo recordings"}
				</p>
			{:else}
				<p class="text-dim">No demo recordings yet.</p>
			{/if}
		</div>
		<label class="flex items-center gap-2 text-sm text-dim w-full sm:w-auto">
			<span class="i-ph-speaker-high" aria-hidden="true"></span>
			<span class="sr-only">Volume</span>
			<input
				type="range"
				class="w-full sm:w-32 accent-blue-300"
				min="0"
				max="1"
				step="0.01"
				bind:value={volume}
				aria-label="Volume"
			/>
		</label>
	</div>
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
	/>
	{#if track && card}
		<RecordingReview
			label={track.label}
			peaks={track.peaks ?? null}
			duration={duration || track.durationSeconds || 0}
			position={currentTime}
			comments={trackComments}
			notes={track.notes}
			{canComment}
			{card}
			onseek={seekTo}
			oncomment={oncomment ? () => oncomment(track) : undefined}
			oncontext={oncontext ? (seconds, x, y) => oncontext(track, seconds, x, y) : undefined}
		/>
	{/if}
	{#if demos.length > 0}
		<ul class="grid gap-2 content-start" aria-label="Demos">
			{#each demos as d (d.id)}
				{@const playing = current === d.id && !paused}
				<li
					class="group bg-black/5 hover-bg-black/10 flex items-center gap-x-4 rounded-md border border-current/40 px-3 py-2 shadow {current ===
					d.id
						? 'bg-white/5'
						: 'border-white/10'}"
				>
					<button
						type="button"
						class="grid h-9 w-9 shrink-0 place-items-center rounded bg-transparent text-white border border-current/40 active:scale-95 hover-text-accent hover-bg-white/5"
						aria-label={playing ? `Pause ${d.label}` : `Play ${d.label}`}
						onclick={() => play(d.id)}
					>
						<span class={playing ? "i-ph-pause-fill" : "i-ph-play-fill"} aria-hidden="true"></span>
					</button>
					<DemoTileText {...d} {...tileCounts.get(d.id)} {current} onopen={show} />
					<DemoRowMenu label={d.label} items={rowItems(d)} />
				</li>
			{/each}
		</ul>
	{/if}
</div>
