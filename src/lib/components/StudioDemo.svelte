<script lang="ts">
	import { barAt } from "#lib/audio/measures.js";
	import { studio } from "#lib/audio/studio.svelte.js";
	import StudioTimeline from "#lib/components/StudioTimeline.svelte";
	import { formatTime } from "#lib/utils/formatTime.js";
	import { isTextEntry } from "#lib/utils/isTextEntry.js";
	import type { StudioSongView } from "#lib/val/StudioSchema.js";
	import { onDestroy, onMount } from "svelte";

	/**
	 * The home page's Dawn demo (docs/multitrack-recorder.md, "The home
	 * demo"): a Dawn song an admin chose on /admin/home, usually the featured
	 * song's stems, in the real engine with the real timeline. Visitors play,
	 * mute, solo, zoom, drag clips and loop; nothing is saved and nothing
	 * records. The engine is the page's singleton, so the demo loads the song
	 * on mount and empties it on leaving.
	 */
	interface Props {
		song: StudioSongView;
		/** Where "Open Dawn" goes: the recorder for a member, sign-in for a visitor. */
		href: string;
		/** Space and Home drive the transport while this demo is the one in view. */
		keyboard?: boolean;
	}
	let { song, href, keyboard = true }: Props = $props();
	// The dev hook the browser tests read, as the Dawn page sets it (tests/e2e/home-dawn.spec.ts).
	if (import.meta.env.DEV && typeof window !== "undefined")
		Object.assign(window, { __studio: studio });

	let pxPerSecond = $state(24);
	let selected = $state<string | null>(null);
	let selectedIds = $state<string[]>([]);
	const readout = $derived.by(() => {
		if (!studio.arrangement.gridOn) return formatTime(studio.position);
		const pos = barAt(studio.grid, studio.position);
		return `${pos.bar} | ${pos.beat}`;
	});

	onMount(() => {
		void studio.load(song);
	});
	onDestroy(() => {
		if (studio.running) studio.stop();
		void studio.load({ current: null, sources: [] });
	});
	function onwindowkeydown(e: KeyboardEvent) {
		if (!keyboard || e.metaKey || e.ctrlKey || e.altKey || isTextEntry(e.target)) return;
		if (e.key === " ") {
			e.preventDefault();
			if (!e.repeat) studio.toggle();
		} else if (e.key === "Home") {
			e.preventDefault();
			studio.rewind();
		}
	}
</script>

<svelte:window onkeydown={onwindowkeydown} />

<section
	class="device-chrome grid gap-3 px-3 py-4 pb-5 @xl-px-5 @xl-pt-5 w-full max-w-full relative @container"
	aria-label="Dawn demo"
	data-studio-demo
>
	<div class="flex flex-wrap items-center justify-between gap-2">
		<div class="min-w-0 truncate text-15px font-600 text-blue-100">Dawn · {song.title}</div>
		<a class="device-button-sm px-3 text-accent" {href}>Open Dawn</a>
	</div>
	<div class="device-screen flex flex-wrap items-end justify-between gap-x-6 gap-y-2 px-4 py-3">
		<div class="min-w-0 grow">
			<div class="text-28px @xl-text-36px leading-none tabular-nums" aria-live="off">
				{readout}
				<span class="text-14px opacity-60 ml-2">{formatTime(studio.position)}</span>
			</div>
			<div class="mt-2 text-12px opacity-70 flex flex-wrap gap-x-2 tabular-nums">
				<span
					>{studio.arrangement.bpm} bpm · {studio.arrangement
						.beatsPerBar}/4{#if studio.keyAt(studio.position)}
						· {studio.keyAt(studio.position)}{/if} · {studio.arrangement.tracks.length}
					{studio.arrangement.tracks.length === 1 ? "track" : "tracks"} · {formatTime(
						studio.duration,
						0,
					)}{#if studio.decoding}
						· loading {studio.decoding}…{/if}</span
				>
			</div>
		</div>
	</div>
	<div class="flex flex-wrap items-center gap-2" role="group" aria-label="Transport">
		<button
			class="device-button-sm px-3 min-w-32px"
			type="button"
			title={studio.running ? "Stop (Space)" : "Play (Space)"}
			aria-label={studio.running ? "Stop" : "Play"}
			onclick={() => studio.toggle()}
		>
			<span class={studio.running ? "i-ph-stop-fill" : "i-ph-play-fill"} aria-hidden="true"></span>
		</button>
		<button
			class="device-button-sm px-3 min-w-32px"
			type="button"
			title="Pause where it is"
			aria-label="Pause"
			disabled={!studio.running}
			onclick={() => studio.pause()}
		>
			<span class="i-ph-pause-fill" aria-hidden="true"></span>
		</button>
		<button
			class="device-button-sm px-3 min-w-32px"
			type="button"
			title="To the start (Home)"
			aria-label="To the start"
			onclick={() => studio.rewind()}
		>
			<span class="i-ph-skip-back-fill" aria-hidden="true"></span>
		</button>
		<button
			class="device-button-sm px-3 min-w-32px {studio.arrangement.loop?.on ? 'text-accent' : ''}"
			type="button"
			title="Loop the region on the ruler (drag across the ruler to set it)"
			aria-label="Loop"
			aria-pressed={studio.arrangement.loop?.on ?? false}
			onclick={() => studio.toggleLoop()}
		>
			<span class="i-ph-repeat" aria-hidden="true"></span>
		</button>
		<div class="ml-auto flex gap-px" role="group" aria-label="Zoom">
			<button
				class="device-button-sm px-3"
				type="button"
				aria-label="Zoom out"
				onclick={() => (pxPerSecond = Math.max(6, pxPerSecond / 1.5))}
			>
				<span class="i-ph-magnifying-glass-minus" aria-hidden="true"></span>
			</button>
			<button
				class="device-button-sm px-3"
				type="button"
				aria-label="Zoom in"
				onclick={() => (pxPerSecond = Math.min(400, pxPerSecond * 1.5))}
			>
				<span class="i-ph-magnifying-glass-plus" aria-hidden="true"></span>
			</button>
		</div>
	</div>
	<StudioTimeline bind:selected bind:selectedIds bind:pxPerSecond />
	<p class="text-12px opacity-70">
		Play, mute and solo the tracks, drag a clip, loop a stretch of the ruler: it is the real Dawn on
		a song of ours. Nothing here is saved; Open Dawn for your own.
	</p>
</section>
