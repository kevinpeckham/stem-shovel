<script lang="ts">
	import type { MidiNote } from "$lib/audio/midi";
	import type { Attachment } from "svelte/attachments";

	/**
	 * A piano roll in the waveform's place: the same size, progress, seek and
	 * keyboard behaviour as Waveform.svelte, drawing the stem's MIDI notes
	 * (x = time on the song's scale, y = pitch) instead of peaks.
	 */
	interface Props {
		notes: MidiNote[];
		lowest: number;
		highest: number;
		/** Playhead position as a fraction of the full song length (0..1). */
		progress: number;
		/** Seconds of song per full width, so the notes sit under the waveform's time scale. */
		songDuration: number;
		dimmed?: boolean;
		label: string;
		onseek?: (fraction: number) => void;
	}

	let {
		notes,
		lowest,
		highest,
		progress,
		songDuration,
		dimmed = false,
		label,
		onseek,
	}: Props = $props();

	let width = $state(0);
	let height = $state(0);

	const roll: Attachment<HTMLCanvasElement> = (canvas) => {
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		$effect(() => {
			if (width === 0 || height === 0) return;
			draw(canvas, ctx, notes, lowest, highest, songDuration, dimmed, width, height);
		});
	};

	function draw(
		el: HTMLCanvasElement,
		ctx: CanvasRenderingContext2D,
		data: MidiNote[],
		lo: number,
		hi: number,
		seconds: number,
		_dim: boolean,
		w: number,
		h: number,
	): void {
		const dpr = window.devicePixelRatio || 1;
		el.width = Math.round(w * dpr);
		el.height = Math.round(h * dpr);
		ctx.scale(dpr, dpr);
		ctx.clearRect(0, 0, w, h);
		ctx.fillStyle = getComputedStyle(el).color;
		// At least an octave of range so a one-note file does not fill the height.
		const span = Math.max(12, hi - lo + 1);
		const base = hi - lo + 1 < 12 ? Math.floor((lo + hi) / 2) - 6 : lo;
		const rowH = h / span;
		const px = (t: number) => (seconds > 0 ? (t / seconds) * w : 0);
		for (const n of data) {
			const y = h - (n.pitch - base + 1) * rowH;
			const x = px(n.start);
			const wide = Math.max(1, px(n.start + n.duration) - x);
			ctx.globalAlpha = 0.4 + 0.6 * (n.velocity / 127);
			ctx.fillRect(x, y + 0.5, wide, Math.max(1, rowH - 1));
		}
		ctx.globalAlpha = 1;
	}

	function seekFromPointer(e: MouseEvent): void {
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		onseek?.(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)));
	}

	function onkeydown(e: KeyboardEvent): void {
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
	aria-label="{label} MIDI notes"
	aria-valuemin="0"
	aria-valuemax="100"
	aria-valuenow={Math.round(progress * 100)}
	data-midi-roll
	bind:clientWidth={width}
	bind:clientHeight={height}
	onclick={seekFromPointer}
	{onkeydown}
>
	<canvas
		{@attach roll}
		class="absolute inset-0 h-full w-full text-blue-300 {dimmed ? 'opacity-30' : 'opacity-90'}"
	></canvas>
	<div
		class="pointer-events-none absolute inset-y-0 w-0.5 bg-maximumYellow"
		style:left="{progress * 100}%"
	></div>
</div>
