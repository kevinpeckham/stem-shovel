<script lang="ts">
	import type { StemEngine } from "$lib/audio/engine.svelte";
	import { barAt, type BarGrid, formatBars } from "$lib/audio/measures";
	import { formatTime } from "$lib/format";
	import { isTextEntry } from "$lib/keys";

	interface Props {
		engine: StemEngine;
		/** When the song has a tempo and a meter, the readout can show bars instead of time. */
		grid?: BarGrid | null;
		/** Song end for the bars total (null = the last stem). */
		endAt?: number | null;
	}

	let { engine, grid = null, endAt = null }: Props = $props();

	// Time or bars. Remembered per browser; falls back to time when no grid.
	let showBars = $state(false);
	try {
		showBars = localStorage.getItem("transport.bars") === "1";
	} catch {
		// private mode etc.
	}
	function toggleReadout() {
		if (!grid) return;
		showBars = !showBars;
		try {
			localStorage.setItem("transport.bars", showBars ? "1" : "0");
		} catch {
			// ignore
		}
	}
	let barsNow = $derived(grid ? formatBars(barAt(grid, engine.position)) : "");
	let barsTotal = $derived(grid ? formatBars(barAt(grid, endAt ?? engine.duration)) : "");

	// Space toggles, Home rewinds, from anywhere except text entry (see $lib/keys).
	// A focused button therefore does NOT activate on Space (Enter still does, and
	// M / S remain the row shortcuts); preventing the keydown default is what
	// stops the browser from firing the button's click on keyup.
	function onwindowkeydown(e: KeyboardEvent): void {
		if (e.metaKey || e.ctrlKey || e.altKey || isTextEntry(e.target)) return;
		if (e.key === " ") {
			e.preventDefault();
			if (!e.repeat) engine.toggle();
		} else if (e.key === "Home") {
			e.preventDefault();
			engine.seek(0);
		}
	}

	/** Belt and braces: some browsers activate buttons on Space keyup. */
	function onwindowkeyup(e: KeyboardEvent): void {
		if (e.key === " " && !isTextEntry(e.target)) e.preventDefault();
	}
</script>

<svelte:window onkeydown={onwindowkeydown} onkeyup={onwindowkeyup} />

<div class="flex flex-wrap items-center gap-4">
	<button
		type="button"
		class="grid h-14 w-10 place-items-center rounded-lg border border-white/15 bg-white/5 text-neutral-100 transition-all hover-bg-white/10 hover-text-accent active:scale-95 disabled:(opacity-40 cursor-wait)"
		aria-label="Go to beginning"
		title="Go to beginning (Home)"
		disabled={engine.status !== "ready"}
		onclick={() => engine.seek(0)}
	>
		<span class="i-ph-skip-back-fill text-20px" aria-hidden="true"></span>
	</button>
	<button
		type="button"
		class="grid h-14 w-14 place-items-center rounded-lg bg-maximumYellow text-oxford transition-all hover:shadow-lg hover:shadow-maximumYellow/30 active:scale-95 disabled:(opacity-40 cursor-wait)"
		aria-label={engine.playing ? "Pause" : "Play"}
		title={engine.status === "ready" ? undefined : "Decoding…"}
		disabled={engine.status !== "ready"}
		onclick={() => engine.toggle()}
	>
		<span
			class="{engine.playing ? 'i-ph-pause-fill' : 'i-ph-play-fill'} text-24px"
			aria-hidden="true"
		></span>
	</button>

	<!-- tabular-nums keeps the readout from jittering as digits change -->
	<button
		type="button"
		class="text-left text-2xl tabular-nums {grid
			? 'cursor-pointer hover-text-accent'
			: 'cursor-default'}"
		title={grid
			? showBars
				? "Bars · beats — click for time"
				: "Time — click for bars · beats"
			: "Add a tempo and a time signature in song settings to count bars"}
		aria-label={grid ? "Toggle time or bars" : undefined}
		onclick={toggleReadout}
	>
		{#if grid && showBars}
			{barsNow}
			<span class="text-dim">/ {barsTotal}</span>
			<span class="ml-1 text-xs text-dim">bars</span>
		{:else}
			{formatTime(engine.position)}
			<span class="text-dim">/ {formatTime(endAt ?? engine.duration)}</span>
		{/if}
	</button>

	<label class="ml-auto flex items-center gap-2 text-sm text-dim">
		Master
		<input
			type="range"
			class="w-32 accent-blue-300"
			min="0"
			max="1"
			step="0.01"
			value={engine.master}
			oninput={(e) => engine.setMaster(e.currentTarget.valueAsNumber)}
		/>
	</label>
</div>
