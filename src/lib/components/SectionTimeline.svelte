<script lang="ts">
	import type { StemEngine } from "$lib/audio/engine.svelte";
	import { formatTime } from "$lib/format";
	import type { SongSection } from "$lib/val/SongSectionSchema";

	interface Props {
		engine: StemEngine;
		/** Sorted by start; the parent hides this row when empty. */
		sections: SongSection[];
	}

	let { engine, sections }: Props = $props();

	// Each block runs from its start to the next start (the last to the end).
	// Laid out on the same grid as a stem row so the blocks sit over the waveforms.
	let duration = $derived(Math.max(engine.duration, sections.at(-1)?.start ?? 0, 1));
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
			<span class="text-neutral-100">· {blocks[currentIndex].name}</span>
		{/if}
	</div>
	<!-- the stem rows' M / S buttons (2 × w-8 + gap-2) and fader (6rem) columns, kept empty so the bar sits over the waveforms -->
	<div class="hidden sm:block sm:w-18" aria-hidden="true"></div>
	<div class="hidden sm:block" aria-hidden="true"></div>
	<div class="relative col-span-3 h-7 sm:col-span-1" role="tablist" aria-label="Jump to section">
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
				title="{b.name} · {formatTime(b.start)} – {formatTime(b.end)}"
				disabled={engine.status !== "ready"}
				onclick={() => engine.seek(b.start)}
			>
				{b.name}
			</button>
		{/each}
	</div>
	<!-- the stem rows end with a menu button; keep the column so the bar lines up with the waveforms -->
	<div class="hidden sm:block sm:w-8" aria-hidden="true"></div>
</div>
