<script lang="ts">
	import { FADER_MAX, type StemEngine } from "$lib/audio/engine.svelte";
	import type { StemState } from "$lib/audio/types";
	import { formatTime } from "$lib/format";
	import Waveform from "./Waveform.svelte";

	interface Props {
		stem: StemState;
		engine: StemEngine;
	}

	let { stem, engine }: Props = $props();

	// Audible right now? Mirrors the engine's effective-gain rule for the visuals.
	const silenced = $derived(stem.muted || (engine.anySolo && !stem.soloed));
	const progress = $derived(engine.duration > 0 ? engine.position / engine.duration : 0);
	const span = $derived(engine.duration > 0 ? stem.duration / engine.duration : 1);

	function onkeydown(e: KeyboardEvent): void {
		// Focus the row (or anything inside it except the fader) and press M / S.
		if (e.target instanceof HTMLInputElement) return;
		if (e.key === "m") engine.toggleMute(stem.id);
		else if (e.key === "s") engine.toggleSolo(stem.id);
		else return;
		e.preventDefault();
	}
</script>

<!-- The row itself is never focused; M/S keydowns bubble up from its focusable
     children (buttons, fader, waveform), so the a11y rule doesn't apply here. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	class="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 border-b border-line py-3 sm:grid-cols-[9rem_auto_6rem_1fr]"
	role="group"
	aria-label={stem.label}
	{onkeydown}
>
	<div class="min-w-0">
		<!-- Conditional classes are written as literal strings (not class: directives)
		     so UnoCSS's default extractor can find them. -->
		<div class="truncate font-medium {silenced ? 'text-dim' : ''}">{stem.label}</div>
		<div class="text-xs text-dim">
			{stem.collapsed ? "dual mono → mono" : stem.channels === 1 ? "mono" : "stereo"}, {formatTime(
				stem.duration,
			)}
		</div>
	</div>

	<div class="flex gap-1">
		<button
			type="button"
			class="h-8 w-8 rounded border border-line text-sm font-semibold transition-colors {stem.muted
				? 'bg-ink text-panel'
				: ''}"
			aria-pressed={stem.muted}
			aria-label="Mute {stem.label}"
			onclick={() => engine.toggleMute(stem.id)}
		>
			M
		</button>
		<button
			type="button"
			class="h-8 w-8 rounded border border-line text-sm font-semibold transition-colors {stem.soloed
				? 'bg-solo text-panel'
				: ''}"
			aria-pressed={stem.soloed}
			aria-label="Solo {stem.label}"
			onclick={() => engine.toggleSolo(stem.id)}
		>
			S
		</button>
	</div>

	<input
		type="range"
		class="w-full accent-ink sm:w-24"
		min="0"
		max={FADER_MAX}
		step="0.01"
		value={stem.gain}
		aria-label="{stem.label} level"
		oninput={(e) => engine.setGain(stem.id, e.currentTarget.valueAsNumber)}
	/>

	<div class="col-span-2 sm:col-span-1">
		<Waveform
			peaks={stem.peaks}
			{progress}
			{span}
			dimmed={silenced}
			label={stem.label}
			onseek={(f) => engine.seek(f * engine.duration)}
		/>
	</div>
</div>
