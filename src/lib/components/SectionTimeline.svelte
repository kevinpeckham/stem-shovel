<script lang="ts">
	import type { StemEngine } from "$lib/audio/engine.svelte";
	import { barGrid, formatBarSpan, formatPosition } from "$lib/audio/measures";
	import { readoutMode } from "$lib/audio/readout.svelte";
	import { type SongChange } from "$lib/val/SongChangeSchema";
	import { formatSongChange } from "$lib/utils/formatSongChange";
	import { timelineKinds } from "$lib/utils/timelineKinds";
	import type { SongSection } from "$lib/val/SongSectionSchema";

	interface Props {
		engine: StemEngine;
		/** Sorted by start; the parent hides this row when both are empty. */
		sections: SongSection[];
		/** Tempo / key / time signature changes, sorted by start: markers above the blocks. */
		changes?: SongChange[];
		/** Bar 1 and the song's end, drawn as lines through the blocks. */
		startAt?: number | null;
		endAt?: number | null;
		fps?: number;
	}

	let { engine, sections, changes = [], startAt = null, endAt = null, fps = 25 }: Props = $props();
	let ctx = $derived({ fps, grid: barGrid(changes, startAt) });
	const at = (seconds: number) => formatPosition(readoutMode(!!ctx.grid), seconds, ctx);

	// Each block runs from its start to the next start (the last to the end).
	// Laid out on the same grid as a stem row so the blocks sit over the waveforms.
	let duration = $derived(
		Math.max(
			engine.duration,
			sections.at(-1)?.start ?? 0,
			changes.at(-1)?.start ?? 0,
			endAt ?? 0,
			1,
		),
	);
	// Lanes for the kinds that actually change (timelineKinds); each marker runs to the next of its kind.
	const LANE_REM = 0.875;
	let lanes = $derived(
		timelineKinds(changes)
			.map((kind) => {
				const of = changes.filter((c) => c.kind === kind);
				return {
					kind,
					markers: of.map((c, i) => ({ ...c, end: of[i + 1]?.start ?? duration })),
				};
			})
			.filter((l) => l.markers.length > 0),
	);
	// What is in force at the playhead, one per kind, in the order tempo · key · meter.
	let current = $derived(
		timelineKinds(changes)
			.map((kind) => changes.findLast((c) => c.kind === kind && engine.position >= c.start))
			.filter((c) => c !== undefined),
	);
	let blocks = $derived(
		sections.map((s, i) => {
			const end = sections[i + 1]?.start ?? duration;
			return {
				...s,
				end,
				left: (s.start / duration) * 100,
				width: Math.max(0, ((end - s.start) / duration) * 100),
			};
		}),
	);
	let currentIndex = $derived(blocks.findLastIndex((b) => engine.position >= b.start) ?? -1);
</script>

<div
	class="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 gap-y-2 border-b border-white/10 py-2 sm:grid-cols-[172px_1fr] leading-none"
	role="group"
	aria-label="Song sections"
>
	<!-- <div class="font-500 mb-2 opacity-90">Current Section:</div> -->
	<div class="flex gap-2 w-full text-14px opacity-95 leading-snug">
		{#if currentIndex >= 0}
			<div class="opacity-80">section:</div>
			<div class="truncate max-w-fit font-600 text 15px">{blocks[currentIndex].name}</div>
		{/if}
	</div>

	<div
		class="relative col-span-3 sm-col-span-1 gap-y-1 text-10px"
		style:padding-top="{lanes.length * LANE_REM}rem"
	>
		{#each lanes as lane, li (lane.kind)}
			<!-- one lane per kind; each marker runs to the next marker of its kind, so its label clips instead of colliding -->
			{#each lane.markers as m (m.start)}
				<div
					class="absolute h-3.5 overflow-hidden border-l pl-1 font-mono leading-3.5 whitespace-nowrap {current.some(
						(c) => c.kind === m.kind && c.start === m.start,
					)
						? 'border-accent text-neutral-100'
						: 'border-white/30'}"
					style:top="{li * LANE_REM}rem"
					style:left="{(m.start / duration) * 100}%"
					style:width="calc({((m.end - m.start) / duration) * 100}% - 1px)"
					title="{formatSongChange(m)} from {at(m.start)}"
				>
					{formatSongChange(m)}
				</div>
			{/each}
		{/each}
		<div class="relative h-6 mt-1" role="tablist" aria-label="Jump to section">
			{#if startAt !== null && startAt > 0}
				<span
					class="pointer-events-none absolute top-0 z-10 h-full border-l border-dashed border-green-300/80"
					style:left="{(startAt / duration) * 100}%"
					title="Start (bar 1) · {at(startAt)}"
				></span>
			{/if}
			{#if endAt !== null && endAt > 0}
				<span
					class="pointer-events-none absolute top-0 z-10 h-full border-l border-dashed border-green-300/80"
					style:left="{(endAt / duration) * 100}%"
					title="End · {at(endAt)}"
				></span>
			{/if}
			{#each blocks as b, i (b.start)}
				<button
					type="button"
					role="tab"
					aria-selected={i === currentIndex}
					class="absolute top-0 h-full overflow-hidden rounded pl-4px text-left text-11px leading-tight whitespace-nowrap transition-colors disabled-cursor-default {i ===
					currentIndex
						? 'border-accent bg-accent/20 text-neutral-100'
						: 'border-white/15 bg-white/10 opacity-90 hover-bg-white/10 hover-text-neutral-100'}"
					style:left="{b.left}%"
					style:width="calc({b.width}% - 2px)"
					title="{b.index ? `${b.index} · ` : ''}{b.name} · {ctx.grid
						? formatBarSpan(ctx.grid, b.start, b.end)
						: `${at(b.start)} – ${at(b.end)}`}"
					disabled={engine.status !== "ready"}
					onclick={() => engine.seek(b.start)}
				>
					<!-- the index (roman numerals) fits where a name would not; the name is the tooltip -->
					{b.index || b.name}
				</button>
			{/each}
		</div>
	</div>
	<!-- the stem rows end with a menu button; keep the column so the bar lines up with the waveforms -->
	<div class="hidden sm:block sm:w-8" aria-hidden="true"></div>
</div>
