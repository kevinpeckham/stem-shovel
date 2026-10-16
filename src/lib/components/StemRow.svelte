<script lang="ts">
	import MidiRoll from "#lib/components/MidiRoll.svelte";
	import type { MidiSummary } from "#lib/audio/midi.js";
	import { FADER_MAX, type StemEngine } from "#lib/audio/engine.svelte.js";
	import type { StemState } from "#lib/audio/types.js";
	import { formatTime } from "#lib/utils/formatTime.js";
	import type { Snippet } from "svelte";
	import Waveform from "#lib/components/Waveform.svelte";
	import Knob from "#lib/components/Knob.svelte";
	import LevelMeter from "#lib/components/LevelMeter.svelte";
	import { stemTintHex } from "#lib/constants/stemTints.js";

	interface Props {
		i?: number;
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
		/** A grip before the name, for reordering (StemPlayer draws it when the rows can be reordered). */
		handle?: Snippet<[StemState]>;
		/** This row is the one being dragged. */
		dragging?: boolean;
	}

	let {
		i,
		stem,
		engine,
		menu,
		badge,
		roll = null,
		oncontext,
		handle,
		dragging = false,
	}: Props = $props();
	const context = (f: number, x: number, y: number) => oncontext?.(stem, f * engine.duration, x, y);

	// Audible right now? Mirrors the engine's effective-gain rule for the visuals.
	const silenced = $derived(stem.muted || (engine.anySolo && !stem.soloed));
	const progress = $derived(engine.duration > 0 ? engine.position / engine.duration : 0);
	const span = $derived(engine.duration > 0 ? stem.duration / engine.duration : 1);
	/** The row's tint (constants/stemTints.ts): the name and the waveform wear it; nothing else does, so it stays a hint. */
	const tint = $derived(stemTintHex(stem.tint));
	/** A level as the knob says it: dB, −∞ at the bottom (as the Studio's faders). */
	const levelText = (v: number) => (v <= 0 ? "−∞ dB" : `${Math.round(20 * Math.log10(v))} dB`);
	/** A pan as the knob says it: L 50, C, R 50 (as the Studio's tracks). */
	const panText = (v: number) =>
		v === 0 ? "C" : v < 0 ? `L ${Math.round(-v * 100)}` : `R ${Math.round(v * 100)}`;

	function onkeydown(e: KeyboardEvent): void {
		// Focus the row (or anything inside it except the fader and the pan) and press M / S.
		if (e.target instanceof HTMLInputElement) return;
		if (e.target instanceof Element && e.target.closest("[data-fader]")) return;
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
		grid-cols-1
		items-center
		gap-x-3
		gap-y-2
		border-b
		border-white/10
		py-3
		@4xl-grid-cols-[14rem_minmax(0,1fr)]
		w-full
		overflow-x-hidden
		relative {dragging ? 'opacity-50' : ''}
		"
	role="group"
	aria-label={stem.label}
	data-stem-row={stem.id}
	{onkeydown}
>
	<!-- Toolbar: the name, then the controls as the Studio's tracks have them (mute, solo, menu, fader, pan). -->
	<div class="w-full min-w-0">
		<!-- track name: min-w-0 and truncate on the text itself, so a long name clips instead of widening the row -->
		<div class="flex min-w-0 items-center gap-2 w-full">
			{#if handle}{@render handle(stem)}{/if}
			<span
				class="flex min-w-0 gap-1 text-14px font-500 text-blue-300 {silenced
					? 'opacity-60 text-slate-100'
					: ''}"
				style:color={tint && !silenced ? tint : undefined}
				title={stem.label}
			>
				{#if i !== undefined}<span class="shrink-0">{i + 1} -</span>{/if}
				<span class="min-w-0 truncate">{stem.label}</span>
			</span>
			{#if badge}<div class="absolute left-96px top-3">{@render badge(stem)}</div>{/if}
		</div>

		<!-- controls -->
		<div class="mt-1 flex w-full items-center gap-x-3">
			<div class="flex items-center gap-1">
				<button
					type="button"
					class="device-fader-button-sm"
					aria-pressed={stem.muted}
					aria-label="Mute {stem.label}"
					onclick={() => engine.toggleMute(stem.id)}>M</button
				>
				<button
					type="button"
					class="device-fader-button-sm"
					aria-pressed={stem.soloed}
					aria-label="Solo {stem.label}"
					onclick={() => engine.toggleSolo(stem.id)}>S</button
				>
				{#if menu}{@render menu(stem)}{/if}
			</div>
			<!-- The fader and the pan as knobs (Knob.svelte), so the meter fits on the same line (Kevin): the value
			     shows while a knob turns; a double-click returns the level to unity, the pan to center.
			     data-fader: the row's M/S keys leave the knobs alone. -->
			<div class="contents" data-fader>
				<Knob
					value={stem.gain}
					min={0}
					max={FADER_MAX}
					step={0.01}
					resetTo={1}
					size={22}
					label="{stem.label} level"
					title="Level (double-click for unity)"
					format={levelText}
					oninput={(v) => engine.setGain(stem.id, v)}
				/>
				<Knob
					value={stem.pan}
					min={-1}
					max={1}
					step={0.05}
					resetTo={0}
					bipolar
					size={22}
					label="{stem.label} pan"
					title="Pan (double-click for center)"
					format={panText}
					oninput={(v) => engine.setPan(stem.id, v)}
				/>
			</div>
			<!-- The level after the fader and pan, with a peak-hold mark and a clip light that sticks until clicked (docs/stem-engine.md, "Meters"). -->
			<LevelMeter
				class="min-w-16 flex-1"
				state={engine.levels[stem.id]}
				label={stem.label}
				onreset={() => engine.resetClips(stem.id)}
			/>
		</div>
	</div>

	<!-- waveform -->
	<div class="w-full max-w-full min-w-0 bg-blue-300/5 rounded">
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
				color={tint}
				dimmed={silenced || !stem.decoded}
				label={stem.label}
				onseek={(f) => engine.seek(f * engine.duration)}
				oncontext={context}
			/>
		{/if}
	</div>
</div>
