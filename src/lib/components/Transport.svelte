<script lang="ts">
	import type { StemEngine } from "$lib/audio/engine.svelte";
	import { formatTime } from "$lib/format";
	import { isTextEntry } from "$lib/keys";

	interface Props {
		engine: StemEngine;
	}

	let { engine }: Props = $props();

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
	<div class="text-2xl tabular-nums">
		{formatTime(engine.position)}
		<span class="text-dim">/ {formatTime(engine.duration)}</span>
	</div>

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
