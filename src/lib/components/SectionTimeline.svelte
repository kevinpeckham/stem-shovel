<script lang="ts">
	import type { StemEngine } from "$lib/audio/engine.svelte";
	import { formatTime } from "$lib/format";
	import { formatSongChange, type SongChange, timelineKinds } from "$lib/val/SongChangeSchema";
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
	}

	let { engine, sections, changes = [], startAt = null, endAt = null }: Props = $props();

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
	class="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 gap-y-2 border-b border-white/10 py-2 sm:grid-cols-[9rem_auto_6rem_1fr_auto]"
	role="group"
	aria-label="Song sections"
>
	<div class="text-xs text-dim">
		Sections
		{#if currentIndex >= 0}
			<span class="ml-1 text-neutral-100">· {blocks[currentIndex].name}</span>
		{/if}
		{#each current as c (c.kind)}
			<span class="ml-1 text-neutral-100">· {formatSongChange(c)}</span>
		{/each}
	</div>
	<!-- the stem rows' M / S buttons (2 × w-8 + gap-2) and fader (6rem) columns, kept empty so the bar sits over the waveforms -->
	<div class="hidden sm:block sm:w-18" aria-hidden="true"></div>
	<div class="hidden sm:block" aria-hidden="true"></div>
	<div class="relative col-span-3 sm:col-span-1" style:padding-top="{lanes.length * LANE_REM}rem">
		{#each lanes as lane, li (lane.kind)}
			<!-- one lane per kind; each marker runs to the next marker of its kind, so its label clips instead of colliding -->
			{#each lane.markers as m (m.start)}
				<span
					class="absolute h-3.5 overflow-hidden border-l pl-1 font-mono text-10px leading-3.5 whitespace-nowrap {current.some(
						(c) => c.kind === m.kind && c.start === m.start,
					)
						? 'border-maximumYellow text-neutral-100'
						: 'border-white/30 text-dim'}"
					style:top="{li * LANE_REM}rem"
					style:left="{(m.start / duration) * 100}%"
					style:width="calc({((m.end - m.start) / duration) * 100}% - 1px)"
					title="{formatSongChange(m)} from {formatTime(m.start)}"
				>
					{formatSongChange(m)}
				</span>
			{/each}
		{/each}
		<div class="relative h-7" role="tablist" aria-label="Jump to section">
			{#if startAt !== null && startAt > 0}
				<span
					class="pointer-events-none absolute top-0 z-10 h-full border-l border-dashed border-green-300/80"
					style:left="{(startAt / duration) * 100}%"
					title="Start (bar 1) · {formatTime(startAt)}"
				></span>
			{/if}
			{#if endAt !== null && endAt > 0}
				<span
					class="pointer-events-none absolute top-0 z-10 h-full border-l border-dashed border-green-300/80"
					style:left="{(endAt / duration) * 100}%"
					title="End · {formatTime(endAt)}"
				></span>
			{/if}
			{#each blocks as b, i (b.start)}
				<button
					type="button"
					role="tab"
					aria-selected={i === currentIndex}
					class="absolute top-0 h-full overflow-hidden rounded border px-1.5 text-left text-xs leading-7 whitespace-nowrap transition-colors disabled:cursor-default {i ===
					currentIndex
						? 'border-maximumYellow bg-maximumYellow/20 text-neutral-100'
						: 'border-white/15 bg-white/5 text-dim hover-bg-white/10 hover-text-neutral-100'}"
					style:left="{b.left}%"
					style:width="calc({b.width}% - 2px)"
					title="{b.index ? `${b.index} · ` : ''}{b.name} · {formatTime(b.start)} – {formatTime(
						b.end,
					)}"
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
