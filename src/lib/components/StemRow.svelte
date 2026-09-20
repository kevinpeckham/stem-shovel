<script lang="ts">
	import MidiRoll from "$lib/components/MidiRoll.svelte";
	import type { MidiSummary } from "$lib/audio/midi";
	import { FADER_MAX, type StemEngine } from "$lib/audio/engine.svelte";
	import type { StemState } from "$lib/audio/types";
	import { formatTime } from "$lib/utils/formatTime";
	import type { Snippet } from "svelte";
	import Waveform from "./Waveform.svelte";

	interface Props {
		stem: StemState;
		engine: StemEngine;
		/** Row actions, rendered after the waveform (see StemPlayer's `stemMenu`). */
		menu?: Snippet<[StemState]>;
		/** Small marks beside the name (a "midi" chip when the stem has a MIDI file). */
		badge?: Snippet<[StemState]>;
		/** When given, a piano roll of the stem's MIDI file replaces the waveform. */
		roll?: MidiSummary | null;
		/** Ctrl / ⌘-click or right-click on the waveform or roll, with the position in seconds. */
		oncontext?: (stem: StemState, seconds: number, x: number, y: number) => void;
	}

	let { stem, engine, menu, badge, roll = null, oncontext }: Props = $props();
	const context = (f: number, x: number, y: number) => oncontext?.(stem, f * engine.duration, x, y);

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
	class="
		grid
		grid-cols-[1fr_auto_auto]
		items-center gap-x-3 gap-y-2 border-b border-white/10 py-3 sm:grid-cols-[80px_80px_1fr] relative"
	role="group"
	aria-label={stem.label}
	{onkeydown}
>
	<!-- track name & meta -->
	<div class="w-full">
		<div class="flex min-w-0 items-center gap-2">
			<div
				class="truncate text-14.5px font-500 text-blue-300 {silenced
					? 'opacity-60 text-slate-100'
					: ''}"
				title={stem.label}
			>
				{stem.label}
			</div>
			{#if badge}<div class="absolute left-96px top-3">{@render badge(stem)}</div>{/if}
		</div>
		<!-- <div class="text-xs text-dim">
			{#if !stem.decoded}
				decoding…{#if stem.duration}
					{formatTime(stem.duration)}{/if}
			{:else}
				{stem.collapsed ? "dual mono → mono" : stem.channels === 1 ? "mono" : "stereo"}, {formatTime(
					stem.duration,
				)}
			{/if}
		</div> -->
		<div class="flex gap-1 text-11px mt-1">
			<button
				type="button"
				class="h-6 w-6 rounded border border-white/25 font-500 transition-colors hover:border-white/60 {stem.muted
					? 'bg-blue-300 text-oxford border-blue-300'
					: ''}"
				aria-pressed={stem.muted}
				aria-label="Mute {stem.label}"
				onclick={() => engine.toggleMute(stem.id)}
			>
				M
			</button>
			<button
				type="button"
				class="h-6 w-6 rounded border border-white/25 font-semibold transition-colors hover:border-white/60 {stem.soloed
					? 'bg-accent text-oxford border-accent'
					: ''}"
				aria-pressed={stem.soloed}
				aria-label="Solo {stem.label}"
				onclick={() => engine.toggleSolo(stem.id)}
			>
				S
			</button>

			{#if menu}
				<div class="">{@render menu(stem)}</div>
			{/if}
		</div>
	</div>

	<!-- mute & solo buttons -->
	<!-- <div class="flex gap-2">
		<button
			type="button"
			class="h-8 w-8 rounded border border-white/25 text-sm font-semibold transition-colors hover:border-white/60 {stem.muted
				? 'bg-blue-300 text-oxford border-blue-300'
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
				? 'bg-accent text-oxford border-accent'
				: ''}"
			aria-pressed={stem.soloed}
			aria-label="Solo {stem.label}"
			onclick={() => engine.toggleSolo(stem.id)}
		>
			S
		</button>
	</div> -->

	<!-- volume slider -->
	<div class="flex items-end h-full pb-2">
		<input
			type="range"
			class="w-full accent-blue-300 sm:w-20"
			min="0"
			max={FADER_MAX}
			step="0.01"
			value={stem.gain}
			aria-label="{stem.label} level"
			oninput={(e) => engine.setGain(stem.id, e.currentTarget.valueAsNumber)}
		/>
	</div>

	<!-- waveform -->
	<div class="col-span-3 sm-col-span-1 bg-blue-300/5 rounded">
		{#if roll}
			<MidiRoll
				notes={roll.notes}
				lowest={roll.lowest}
				highest={roll.highest}
				{progress}
				songDuration={engine.duration}
				dimmed={silenced}
				label={stem.label}
				onseek={(f) => engine.seek(f * engine.duration)}
				oncontext={context}
			/>
		{:else}
			<Waveform
				peaks={stem.peaks}
				{progress}
				{span}
				dimmed={silenced || !stem.decoded}
				label={stem.label}
				onseek={(f) => engine.seek(f * engine.duration)}
				oncontext={context}
			/>
		{/if}
	</div>

	<!-- context menu -->
	<!-- {#if menu}
		<div class="row-start-1 col-start-3 sm:col-start-5 sm:row-auto">{@render menu(stem)}</div>
	{/if} -->
</div>
