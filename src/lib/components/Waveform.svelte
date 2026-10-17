<script lang="ts">
	import type { Attachment } from "svelte/attachments";

	interface Props {
		peaks: number[];
		/** Playhead position as a fraction of the *full* song length (0..1). */
		progress: number;
		/** This stem's length as a fraction of the full song, so shorter stems draw shorter. */
		span?: number;
		/** Draw in the dim color when the stem is muted or not soloed. */
		dimmed?: boolean;
		/** A CSS color for the bars; the canvas's own `color` (white) without. */
		color?: string | null;
		label: string;
		onseek?: (fraction: number) => void;
		/** Ctrl / ⌘-click or right-click: a menu for this position instead of a seek. */
		oncontext?: (fraction: number, x: number, y: number) => void;
		/** The selected stretch, as fractions of the full song (the loop, docs/stem-engine.md), drawn over the bars. */
		range?: { from: number; to: number } | null;
		/** A drag across the bars selects a stretch (fractions, in order); a plain click still seeks. */
		onrange?: (from: number, to: number) => void;
	}

	let {
		peaks,
		progress,
		span = 1,
		dimmed = false,
		color = null,
		label,
		onseek,
		oncontext,
		range = null,
		onrange,
	}: Props = $props();
	/** A drag in progress: where it began, and whether it has gone far enough to be a selection rather than a click. */
	let drag: { pointerId: number; x: number; from: number; selecting: boolean } | null = null;
	let suppressClick = false;

	// Measured by bind:clientWidth / bind:clientHeight on the wrapper.
	let width = $state(0);
	let height = $state(0);

	// Attachment: runs once when the <canvas> mounts (it reads no state
	// synchronously, so it never re-runs). The nested $effect is the redraw —
	// it tracks peaks, span, dimmed, width and height and re-runs on change.
	// The playhead is a separate DOM element so 60 fps position updates never
	// touch the canvas.
	const waveform: Attachment<HTMLCanvasElement> = (canvas) => {
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		$effect(() => {
			if (width === 0 || height === 0) return;
			void color; // the canvas's color is a style; a change redraws
			draw(canvas, ctx, peaks, span, dimmed, width, height);
		});
	};

	function draw(
		el: HTMLCanvasElement,
		ctx: CanvasRenderingContext2D,
		data: number[],
		fraction: number,
		_dim: boolean, // tracked by the effect so a mute/solo change redraws
		w: number,
		h: number,
	): void {
		const dpr = window.devicePixelRatio || 1;
		// Resizing the backing store also resets the context's transform/state.
		el.width = Math.round(w * dpr);
		el.height = Math.round(h * dpr);
		ctx.scale(dpr, dpr);
		ctx.clearRect(0, 0, w, h);
		// The color is the canvas's own `color` (a text-* utility on the element)
		// below, so the palette stays in uno.config.ts and nothing is imported.
		ctx.fillStyle = getComputedStyle(el).color;

		const mid = h / 2;
		const drawWidth = w * fraction; // stem length in px
		const bins = data.length;
		// One vertical bar per CSS pixel, mirrored around the center line.
		for (let x = 0; x < drawWidth; x++) {
			const bin = Math.min(bins - 1, Math.floor((x / drawWidth) * bins));
			const amp = data[bin] * (mid - 1);
			ctx.fillRect(x, mid - amp, 1, Math.max(1, amp * 2));
		}
	}

	function fractionAt(e: MouseEvent): number {
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
	}

	function onpointerdown(e: PointerEvent): void {
		if (!onrange || e.button !== 0 || e.ctrlKey || e.metaKey) return;
		drag = { pointerId: e.pointerId, x: e.clientX, from: fractionAt(e), selecting: false };
	}
	function onpointermove(e: PointerEvent): void {
		if (!drag || e.pointerId !== drag.pointerId) return;
		if (!drag.selecting) {
			if (Math.abs(e.clientX - drag.x) < 4) return;
			drag.selecting = true;
			(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		}
		const to = fractionAt(e);
		onrange?.(Math.min(drag.from, to), Math.max(drag.from, to));
	}
	function onpointerup(e: PointerEvent): void {
		if (!drag || e.pointerId !== drag.pointerId) return;
		// The click that follows a selection must not seek.
		suppressClick = drag.selecting;
		drag = null;
	}

	function seekFromPointer(e: MouseEvent): void {
		if (suppressClick) {
			suppressClick = false;
			return;
		}
		if ((e.ctrlKey || e.metaKey) && oncontext) {
			e.preventDefault();
			oncontext(fractionAt(e), e.clientX, e.clientY);
			return;
		}
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const fraction = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
		onseek?.(fraction);
	}

	function onkeydown(e: KeyboardEvent): void {
		// Arrow keys nudge by 2% of the song; Home/End jump.
		const step = 0.02;
		if (e.key === "ArrowLeft") onseek?.(Math.max(0, progress - step));
		else if (e.key === "ArrowRight") onseek?.(Math.min(1, progress + step));
		else if (e.key === "Home") onseek?.(0);
		else if (e.key === "End") onseek?.(1);
		else return;
		e.preventDefault();
	}
</script>

<div
	class="relative h-14 w-full cursor-pointer select-none rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-playhead"
	role="slider"
	tabindex="0"
	aria-label="{label} position"
	aria-valuemin="0"
	aria-valuemax="100"
	aria-valuenow={Math.round(progress * 100)}
	bind:clientWidth={width}
	bind:clientHeight={height}
	onclick={seekFromPointer}
	{onpointerdown}
	{onpointermove}
	{onpointerup}
	onpointercancel={onpointerup}
	oncontextmenu={(e) => {
		if (!oncontext) return;
		e.preventDefault();
		oncontext(fractionAt(e), e.clientX, e.clientY);
	}}
	{onkeydown}
>
	<canvas
		{@attach waveform}
		class="absolute inset-0 h-full w-full text-white {dimmed ? 'opacity-20' : 'opacity-90'}"
		style:color={color ?? undefined}
	></canvas>
	{#if range && range.to > range.from}
		<!-- The selection (the loop): a band over the bars, the same on every row. -->
		<div
			class="pointer-events-none absolute inset-y-0 border-x border-accent/70 bg-accent/15"
			style:left="{range.from * 100}%"
			style:width="{(range.to - range.from) * 100}%"
			data-range
		></div>
	{/if}
	<!-- Playhead: positioned by percentage so it stays correct on resize -->
	<div
		class="pointer-events-none absolute inset-y-0 w-0.5 bg-accent"
		style:left="{progress * 100}%"
	></div>
</div>
