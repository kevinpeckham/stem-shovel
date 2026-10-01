<script lang="ts">
	import type { Snippet } from "svelte";
	import type { Attachment } from "svelte/attachments";

	/**
	 * A floating, draggable, resizable panel for a desktop page (the Idea
	 * Recorder's drum machine, docs/demo-recording.md "The drum machine
	 * panel"): fixed to the viewport, dragged by its header (pointer capture,
	 * so a fast drag never loses it), resized by the browser's own corner
	 * handle (`resize`), its place and size remembered per browser under
	 * `storageKey`. Opening clamps it into the viewport, so a panel left off
	 * a wider screen is reachable on a narrower one. The body is a
	 * `@container`, so what it holds lays itself out by the panel's width.
	 */
	interface Props {
		open: boolean;
		title: string;
		storageKey: string;
		/** The starting size; the minimum the handle allows is 480 × 320. */
		width?: number;
		height?: number;
		/** Extra controls in the header, before the minimise button. */
		controls?: Snippet;
		children: Snippet;
		onminimise: () => void;
	}
	let {
		open,
		title,
		storageKey,
		width = 760,
		height = 600,
		controls,
		children,
		onminimise,
	}: Props = $props();

	let x = $state(24);
	let y = $state(96);
	// The props seed the size; from here the panel's own handle and the remembered place set it.
	// svelte-ignore state_referenced_locally
	let w = $state(width);
	// svelte-ignore state_referenced_locally
	let h = $state(height);
	let placed = false;

	function remember() {
		try {
			localStorage.setItem(storageKey, JSON.stringify({ x, y, w, h }));
		} catch {
			// Private mode or a full store: the place lasts for this page only.
		}
	}
	/** The remembered place, clamped so the header is always on screen. */
	function place() {
		try {
			const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null") as {
				x: number;
				y: number;
				w: number;
				h: number;
			} | null;
			if (saved && [saved.x, saved.y, saved.w, saved.h].every(Number.isFinite)) {
				w = Math.max(480, Math.min(window.innerWidth - 16, saved.w));
				h = Math.max(320, Math.min(window.innerHeight - 16, saved.h));
				x = saved.x;
				y = saved.y;
			} else {
				w = Math.min(width, window.innerWidth - 48);
				h = Math.min(height, window.innerHeight - 120);
				x = Math.max(8, window.innerWidth - w - 24);
				y = 96;
			}
		} catch {
			// As above.
		}
		x = Math.max(8, Math.min(window.innerWidth - 120, x));
		y = Math.max(8, Math.min(window.innerHeight - 48, y));
	}
	$effect(() => {
		if (open && !placed) {
			placed = true;
			place();
		}
		if (!open) placed = false;
	});

	// Dragging by the header.
	let drag: { dx: number; dy: number } | null = null;
	function onpointerdown(e: PointerEvent) {
		if ((e.target as HTMLElement).closest("button, input, select, a")) return;
		drag = { dx: e.clientX - x, dy: e.clientY - y };
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		e.preventDefault();
	}
	function onpointermove(e: PointerEvent) {
		if (!drag) return;
		x = Math.max(8, Math.min(window.innerWidth - 120, e.clientX - drag.dx));
		y = Math.max(8, Math.min(window.innerHeight - 48, e.clientY - drag.dy));
	}
	function onpointerup() {
		if (!drag) return;
		drag = null;
		remember();
	}
	// The size follows the corner handle (the browser's own resize); remembered as it settles.
	let sizeTimer: ReturnType<typeof setTimeout> | null = null;
	const sized: Attachment<HTMLElement> = (node) => {
		const ro = new ResizeObserver(() => {
			// The outer size (the border counts, as the style does); a reading under the minimum is the panel on its way out.
			if (!node.isConnected || node.offsetWidth < 480 || node.offsetHeight < 320) return;
			w = node.offsetWidth;
			h = node.offsetHeight;
			if (sizeTimer) clearTimeout(sizeTimer);
			sizeTimer = setTimeout(remember, 300);
		});
		ro.observe(node);
		return () => {
			ro.disconnect();
			if (sizeTimer) clearTimeout(sizeTimer);
			sizeTimer = null;
		};
	};
</script>

{#if open}
	<div
		class="fixed z-40 grid grid-rows-[auto_1fr] rounded-lg border border-current/15 bg-oxford shadow-2xl shadow-black/60 overflow-hidden resize min-w-480px min-h-320px max-w-[calc(100vw-16px)] max-h-[calc(100vh-16px)]"
		style:left="{x}px"
		style:top="{y}px"
		style:width="{w}px"
		style:height="{h}px"
		{@attach sized}
		aria-label={title}
		role="dialog"
	>
		<!-- The drag handle is a pointer affordance; the toolbar button and Minimise cover the keyboard. -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<header
			class="flex items-center gap-3 px-3 py-2 border-b border-current/10 bg-oxford-800 cursor-move select-none touch-none"
			{onpointerdown}
			{onpointermove}
			{onpointerup}
			onpointercancel={onpointerup}
		>
			<span class="i-ph-dots-six-vertical opacity-50" aria-hidden="true"></span>
			<span class="font-600 text-14px grow">{title}</span>
			{@render controls?.()}
			<button
				class="button button-xs"
				type="button"
				title="Minimise to the toolbar"
				aria-label="Minimise {title}"
				onclick={onminimise}
			>
				<span class="i-ph-arrows-in-simple" aria-hidden="true"></span>
			</button>
		</header>
		<div class="@container min-h-0 overflow-auto p-3">
			{@render children()}
		</div>
	</div>
{/if}
