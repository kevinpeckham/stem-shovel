<script lang="ts">
	import type { StemEngine } from "$lib/audio/engine.svelte";
	import { combinePeaks } from "$lib/audio/peaks";
	import Waveform from "$lib/components/Waveform.svelte";
	import type { Snippet } from "svelte";

	/**
	 * A row under the stems, on the stem-row grid: the mix's waveform (the
	 * stems summed, or their stored peaks combined until they are decoded)
	 * with an icon at each located comment. Clicking an icon marks that
	 * point on the waveform and opens a card anchored to the icon. The card's
	 * contents come from the page (`card` snippet) so it can offer edit and
	 * delete with the page's permissions and forms.
	 */
	export interface LocatedComment {
		id: string;
		title: string;
		at: number;
	}

	interface Props {
		engine: StemEngine;
		comments: LocatedComment[];
		card: Snippet<[string]>;
	}

	let { engine, comments, card }: Props = $props();
	let open = $state<string | null>(null);
	let duration = $derived(Math.max(engine.duration, ...comments.map((c) => c.at), 1));
	let peaks = $derived(
		engine.mixPeaks.length > 0
			? engine.mixPeaks
			: combinePeaks(
					engine.stems.map((s) => ({ peaks: s.peaks, duration: s.duration })),
					engine.duration,
				),
	);
	let marked = $derived(comments.find((c) => c.id === open));

	function onwindowpointerdown(e: PointerEvent) {
		if (open && !(e.target as HTMLElement).closest("[data-comment-anchor]")) open = null;
	}
	function onwindowkeydown(e: KeyboardEvent) {
		if (e.key === "Escape") open = null;
	}
</script>

<svelte:window onpointerdown={onwindowpointerdown} onkeydown={onwindowkeydown} />

<div
	class="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 gap-y-2 py-2 sm:grid-cols-[172px_1fr] leading-none"
	role="group"
	aria-label="Comments on the timeline"
>
	<div class="text-11px opacity-90">Comments</div>
	<div class="relative col-span-3 sm-col-span-1">
		<div class="opacity-50">
			<Waveform
				{peaks}
				progress={engine.duration > 0 ? engine.position / engine.duration : 0}
				span={engine.duration > 0 ? engine.duration / duration : 1}
				label="Mix"
				onseek={(f) => engine.seek(f * duration)}
			/>
		</div>
		{#if marked}
			<div
				class="pointer-events-none absolute inset-y-0 w-px bg-accent"
				style:left="{(marked.at / duration) * 100}%"
			></div>
		{/if}
		{#each comments as c (c.id)}
			{@const left = (c.at / duration) * 100}
			<div class="absolute top-0 h-7" style:left="{left}%" data-comment-anchor>
				<button
					type="button"
					class="-ml-2 grid h-7 w-4 place-items-center text-14px transition-colors {open === c.id
						? 'text-accent'
						: 'opacity-80 hover-text-accent hover-opacity-100'}"
					title={c.title}
					aria-label="Comment: {c.title}"
					aria-expanded={open === c.id}
					onclick={() => (open = open === c.id ? null : c.id)}
				>
					<span class="i-ph-chat-circle-dots-fill"></span>
				</button>
				{#if open === c.id}
					<div
						class="absolute top-8 z-30 w-72 rounded-md border border-white/15 bg-oxford-800 p-3 text-sm shadow-lg shadow-black/50 {left >
						60
							? 'right-0'
							: 'left-0'}"
						role="dialog"
						aria-label={c.title}
					>
						{@render card(c.id)}
					</div>
				{/if}
			</div>
		{/each}
	</div>
</div>
