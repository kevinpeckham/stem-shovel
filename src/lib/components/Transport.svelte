<script lang="ts">
	import type { StemEngine } from "$lib/audio/engine.svelte";
	import { formatTime } from "$lib/format";

	interface Props {
		engine: StemEngine;
	}

	let { engine }: Props = $props();

	function onwindowkeydown(e: KeyboardEvent): void {
		// Space = play/pause from anywhere, unless the user is on a control that
		// already consumes space (buttons, faders). Home = back to start.
		// The waveform (role=slider) doesn't use space, so it's not excluded.
		const t = e.target;
		const onControl = t instanceof HTMLButtonElement || t instanceof HTMLInputElement;
		if (e.key === " " && !onControl) {
			e.preventDefault();
			engine.toggle();
		} else if (e.key === "Home" && !onControl) {
			e.preventDefault();
			engine.seek(0);
		}
	}
</script>

<svelte:window onkeydown={onwindowkeydown} />

<div class="flex flex-wrap items-center gap-4">
	<button
		type="button"
		class="grid h-14 w-14 place-items-center rounded-lg bg-maximumYellow text-oxford transition-all hover:shadow-lg hover:shadow-maximumYellow/30 active:scale-95"
		aria-label={engine.playing ? "Pause" : "Play"}
		onclick={() => engine.toggle()}
	>
		<span
			class="{engine.playing ? 'i-ph-pause-fill' : 'i-ph-play-fill'} text-26px"
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
			class="w-32 accent-ink"
			min="0"
			max="1"
			step="0.01"
			value={engine.master}
			oninput={(e) => engine.setMaster(e.currentTarget.valueAsNumber)}
		/>
	</label>
</div>
