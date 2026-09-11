<script lang="ts">
	import type { Attachment } from "svelte/attachments";
	import { colors } from "$lib/theme";

	interface Props {
		peaks: number[];
		/** Playhead position as a fraction of the *full* song length (0..1). */
		progress: number;
		/** This stem's length as a fraction of the full song, so shorter stems draw shorter. */
		span?: number;
		/** Draw in the dim colour when the stem is muted or not soloed. */
		dimmed?: boolean;
		label: string;
		onseek?: (fraction: number) => void;
	}

	let { peaks, progress, span = 1, dimmed = false, label, onseek }: Props = $props();

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
			draw(canvas, ctx, peaks, span, dimmed, width, height);
		});
	};

	function draw(
		el: HTMLCanvasElement,
		ctx: CanvasRenderingContext2D,
		data: number[],
		fraction: number,
		dim: boolean,
		w: number,
		h: number,
	): void {
		const dpr = window.devicePixelRatio || 1;
		// Resizing the backing store also resets the context's transform/state.
		el.width = Math.round(w * dpr);
		el.height = Math.round(h * dpr);
		ctx.scale(dpr, dpr);
		ctx.clearRect(0, 0, w, h);
		ctx.fillStyle = dim ? colors.waveDim : colors.wave;

		const mid = h / 2;
		const drawWidth = w * fraction; // stem length in px
		const bins = data.length;
		// One vertical bar per CSS pixel, mirrored around the centre line.
		for (let x = 0; x < drawWidth; x++) {
			const bin = Math.min(bins - 1, Math.floor((x / drawWidth) * bins));
			const amp = data[bin] * (mid - 1);
			ctx.fillRect(x, mid - amp, 1, Math.max(1, amp * 2));
		}
	}

	function seekFromPointer(e: MouseEvent): void {
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
	{onkeydown}
>
	<canvas {@attach waveform} class="absolute inset-0 h-full w-full"></canvas>
	<!-- Playhead: positioned by percentage so it stays correct on resize -->
	<div
		class="pointer-events-none absolute inset-y-0 w-0.5 bg-playhead"
		style:left="{progress * 100}%"
	></div>
</div>
