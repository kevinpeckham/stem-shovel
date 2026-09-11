<script lang="ts">
	import { FADER_MAX, type StemEngine } from "$lib/audio/engine.svelte";
	import type { StemState } from "$lib/audio/types";
	import { formatTime } from "$lib/format";
	import type { Snippet } from "svelte";
	import Waveform from "./Waveform.svelte";

	interface Props {
		stem: StemState;
		engine: StemEngine;
		/** Row actions, rendered after the waveform (see StemPlayer's `stemMenu`). */
		menu?: Snippet<[StemState]>;
	}

	let { stem, engine, menu }: Props = $props();

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
	class="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 gap-y-2 border-b border-white/10 py-3 sm:grid-cols-[9rem_auto_6rem_1fr_auto]"
	role="group"
	aria-label={stem.label}
	{onkeydown}
>
	<div class="min-w-0">
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
			class="h-8 w-8 rounded border border-white/25 text-sm font-semibold transition-colors hover:border-white/60 {stem.muted
				? 'bg-neutral-100 text-oxford border-neutral-100'
				: ''}"
			aria-pressed={stem.muted}
			aria-label="Mute {stem.label}"
			onclick={() => engine.toggleMute(stem.id)}
		>
			M
		</button>
		<button
			type="button"
			class="h-8 w-8 rounded border border-white/25 text-sm font-semibold transition-colors hover:border-white/60 {stem.soloed
				? 'bg-solo text-oxford border-solo'
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

	<div class="col-span-3 sm:col-span-1">
		<Waveform
			peaks={stem.peaks}
			{progress}
			{span}
			dimmed={silenced}
			label={stem.label}
			onseek={(f) => engine.seek(f * engine.duration)}
		/>
	</div>

	{#if menu}
		<div class="row-start-1 col-start-3 sm:col-start-5 sm:row-auto">{@render menu(stem)}</div>
	{/if}
</div>
