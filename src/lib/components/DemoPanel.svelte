<script lang="ts">
	import { formatBytes } from "$lib/utils/formatBytes";
	import { formatTime } from "$lib/utils/formatTime";
	import { saveAs } from "$lib/upload";
	import { tick } from "svelte";

	/**
	 * The song page's demos view, sharing the player's box with the stem
	 * player: a transport (previous, play/pause, next, seek, volume) over the
	 * list of demo recordings, each with its own play button and a ⋯ menu
	 * holding its downloads.
	 * The page decides which view shows; `pause()` lets it quiet this one
	 * when the stems take over.
	 */
	export interface PanelDemo {
		id: string;
		label: string;
		url: string;
		playbackUrl: string | null;
		filename: string;
		sizeBytes: number;
	}
	interface Props {
		demos: PanelDemo[];
		/** At least this tall (the stem player's box, so the page keeps its shape across the toggle). */
		minHeight?: number;
	}
	let { demos, minHeight = 0 }: Props = $props();

	let current = $state<string | null>(null);
	let paused = $state(true);
	let track = $derived(demos.find((d) => d.id === current) ?? null);
	let index = $derived(track ? demos.indexOf(track) : -1);
	let audio = $state<HTMLAudioElement | null>(null);
	let currentTime = $state(0);
	let duration = $state(0);
	let volume = $state(1);
	let panelEl = $state<HTMLDivElement | null>(null);

	/** A press outside an open row menu closes it, as the page's own menus do. */
	function closeMenus(e: PointerEvent) {
		for (const menu of panelEl?.querySelectorAll<HTMLDetailsElement>("details[open]") ?? []) {
			if (!menu.contains(e.target as Node)) menu.open = false;
		}
	}

	/** Play a demo (from its row or the transport); the same demo toggles. */
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
	export function pause() {
		paused = true;
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
	function seek(e: Event) {
		const at = Number((e.currentTarget as HTMLInputElement).value);
		if (audio) audio.currentTime = at;
		currentTime = at;
	}
</script>

<svelte:window onpointerdown={closeMenus} />

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
	bind:this={panelEl}
	class="rounded-md border border-current/40 bg-blue/5 px-4 py-3 grid gap-4 grid-rows-[auto_auto_1fr]"
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
					<span class="min-w-0 grow truncate">
						<span class="block font-500">{d.label}</span>
						<span class="block text-xs opacity-85">{formatBytes(d.sizeBytes)}</span>
					</span>
					<!-- The row's menu: the downloads, out of the way of Play. -->
					<details class="relative self-center">
						<summary
							class="button button-xs border-current/10 flex items-center list-none [&::-webkit-details-marker]:hidden"
							title="Demo menu"
							aria-label="Menu for {d.label}"
						>
							<span class="i-ph-dots-three-outline-vertical-fill" aria-hidden="true"></span>
						</summary>
						<div
							class="absolute top-full right-0 z-20 mt-1 min-w-48 rounded border border-white/15 bg-oxford p-1 text-sm font-400 shadow-lg"
							role="menu"
							onclick={(e) => ((e.currentTarget.parentElement as HTMLDetailsElement).open = false)}
							onkeydown={(e) => {
								if (e.key === "Escape")
									(e.currentTarget.parentElement as HTMLDetailsElement).open = false;
							}}
						>
							{#if d.playbackUrl}
								<button
									class="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-white/10"
									type="button"
									role="menuitem"
									onclick={() => saveAs(d.playbackUrl!, `${d.label}.mp3`)}
								>
									<span class="i-ph-download-simple" aria-hidden="true"></span>Download MP3
								</button>
							{/if}
							<button
								class="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-white/10"
								type="button"
								role="menuitem"
								title={d.filename}
								onclick={() => saveAs(d.url, d.filename)}
							>
								<span class="i-ph-file-audio" aria-hidden="true"></span>Download {d.playbackUrl
									? "original"
									: "file"}
							</button>
						</div>
					</details>
				</li>
			{/each}
		</ul>
	{/if}
</div>
