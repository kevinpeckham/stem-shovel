<script lang="ts">
	import type { Attachment } from "svelte/attachments";

	/**
	 * The Idea Recorder's waveform (docs/demo-recording.md, "Waveform"): while
	 * recording, a strip that scrolls as the take grows, one bar per animation
	 * frame of the input's level, the newest at the right; with a take loaded,
	 * the whole take's peaks (decoded once, `computePeaks`) with a playhead,
	 * clicked or dragged to seek. The canvas draws in its own `color`, so the
	 * palette stays in uno.config.ts; the playhead is a separate element so
	 * its 60 fps moves never touch the canvas.
	 */
	interface Props {
		/** The take's peaks, 0 to 1 per bin; null while recording or before a take is decoded. */
		peaks: Float32Array | null;
		/** The input's level per frame while recording, oldest first. */
		history: number[];
		recording: boolean;
		/** The playhead as a fraction of the take, 0 to 1. */
		progress: number;
		onseek?: (fraction: number) => void;
	}
	let { peaks, history, recording, progress, onseek }: Props = $props();

	let width = $state(0);
	let height = $state(0);

	const wave: Attachment<HTMLCanvasElement> = (canvas) => {
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		$effect(() => {
			if (width === 0 || height === 0) return;
			// Tracked: peaks, history's length, recording, width, height.
			draw(canvas, ctx, peaks, recording ? history.length : -1, width, height);
		});
	};

	function draw(
		el: HTMLCanvasElement,
		ctx: CanvasRenderingContext2D,
		data: Float32Array | null,
		frames: number,
		w: number,
		h: number,
	): void {
		const dpr = window.devicePixelRatio || 1;
		el.width = Math.round(w * dpr);
		el.height = Math.round(h * dpr);
		ctx.scale(dpr, dpr);
		ctx.clearRect(0, 0, w, h);
		ctx.fillStyle = getComputedStyle(el).color;
		const mid = h / 2;
		// The centre line, so an empty screen still reads as a waveform's home.
		ctx.globalAlpha = 0.25;
		ctx.fillRect(0, mid, w, 1);
		ctx.globalAlpha = 1;
		if (frames >= 0) {
			// Recording: two pixels per frame, the newest bar at the right edge, older ones sliding left.
			const step = 2;
			const shown = Math.min(frames, Math.floor(w / step));
			for (let i = 0; i < shown; i++) {
				const amp = Math.min(1, history[frames - shown + i] ?? 0) * (mid - 1);
				const x = w - (shown - i) * step;
				ctx.fillRect(x, mid - amp, 1, Math.max(1, amp * 2));
			}
			return;
		}
		if (!data || data.length === 0) return;
		// A take: one bar per pixel across the whole width, mirrored about the centre.
		for (let x = 0; x < w; x++) {
			const bin = Math.min(data.length - 1, Math.floor((x / w) * data.length));
			const amp = data[bin]! * (mid - 1);
			ctx.fillRect(x, mid - amp, 1, Math.max(1, amp * 2));
		}
	}

	let seeking = false;
	function fractionAt(e: PointerEvent): number {
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
	}
	function onpointerdown(e: PointerEvent) {
		if (!peaks || !onseek) return;
		seeking = true;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		onseek(fractionAt(e));
	}
	function onpointermove(e: PointerEvent) {
		if (seeking && onseek) onseek(fractionAt(e));
	}
	function onpointerup() {
		seeking = false;
	}
	function onkeydown(e: KeyboardEvent): void {
		if (!peaks || !onseek) return;
		const step = 0.02;
		if (e.key === "ArrowLeft") onseek(Math.max(0, progress - step));
		else if (e.key === "ArrowRight") onseek(Math.min(1, progress + step));
		else if (e.key === "Home") onseek(0);
		else if (e.key === "End") onseek(1);
		else return;
		e.preventDefault();
	}
</script>

<div
	class="relative w-full h-10 sm-h-14 select-none rounded-sm outline-none focus-visible-ring-2 focus-visible-ring-accent {peaks
		? 'cursor-pointer'
		: ''}"
	role="slider"
	tabindex={peaks ? 0 : -1}
	aria-label="Take position"
	aria-valuemin="0"
	aria-valuemax="100"
	aria-valuenow={Math.round(progress * 100)}
	aria-disabled={!peaks}
	bind:clientWidth={width}
	bind:clientHeight={height}
	{onpointerdown}
	{onpointermove}
	{onpointerup}
	onpointercancel={onpointerup}
	{onkeydown}
>
	<canvas
		{@attach wave}
		class="absolute inset-0 h-full w-full {recording ? 'text-red-400' : 'text-blue-100/80'}"
	></canvas>
	{#if peaks}
		<div
			class="pointer-events-none absolute inset-y-0 w-0.5 bg-accent"
			style:left="{progress * 100}%"
		></div>
	{/if}
</div>
