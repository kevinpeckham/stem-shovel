<script lang="ts">
	import type { Snippet } from "svelte";

	/**
	 * A small info button that opens an anchored popover with a short
	 * explanation. Tap or click (not hover, so it works on a phone); the
	 * popover is a native `popover="auto"`, so Escape and a click outside
	 * close it and it sits in the top layer above everything. Placed under
	 * the button, aligned to its left edge and kept inside the viewport.
	 *
	 * Pass `text` for a sentence or two, or `children` for richer content.
	 */
	interface Props {
		text?: string;
		/** The button's accessible name. */
		label?: string;
		/** Popover width class; the viewport caps it. */
		width?: string;
		/** Extra classes on the button. */
		class?: string;
		children?: Snippet;
	}
	let { classes = "", text, label = "More info", width = "w-72", class: cls = "", children }: Props = $props();

	const id = `info-tip-${Math.random().toString(36).slice(2, 8)}`;
	let buttonEl = $state<HTMLButtonElement | null>(null);
	let tipEl = $state<HTMLDivElement | null>(null);

	/** Place the popover under the button (top-layer coordinates are the viewport's). */
	function place() {
		if (!buttonEl || !tipEl) return;
		const b = buttonEl.getBoundingClientRect();
		const gap = 6;
		const w = tipEl.offsetWidth;
		const h = tipEl.offsetHeight;
		const left = Math.max(8, Math.min(b.left, window.innerWidth - w - 8));
		const below = b.bottom + gap;
		const top = below + h > window.innerHeight - 8 ? Math.max(8, b.top - gap - h) : below;
		tipEl.style.left = `${left}px`;
		tipEl.style.top = `${top}px`;
	}
</script>

<button
	class="inline-flex items-center justify-center rounded-full text-current/70 hover:text-accent focus-visible:(outline-2 outline-accent) align-middle {cls}"
	type="button"
	bind:this={buttonEl}
	popovertarget={id}
	aria-label={label}
	title={label}
>
	<span class="i-ph-info text-18px" aria-hidden="true"></span>
</button>
<div
	{id}
	popover="auto"
	bind:this={tipEl}
	ontoggle={(e) => {
		if (e.newState === "open") place();
	}}
	class="m-0 max-w-[calc(100vw-1rem)] rounded-md border border-white/15 bg-oxford px-4 py-3 text-sm font-400 leading-snug text-neutral-100 text-left shadow-2xl shadow-black/60 {width}"
	role="note"
>
	{#if children}
		{@render children()}
	{:else if text}
		<p>{text}</p>
	{/if}
</div>
