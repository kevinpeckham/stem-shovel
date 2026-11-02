<script lang="ts">
	import { metronome } from "#lib/audio/metronome.svelte.js";
	import { progressionPad } from "#lib/audio/progression.svelte.js";
	import ComboBox from "#lib/components/ComboBox.svelte";
	import InfoTip from "#lib/components/InfoTip.svelte";
	import { BPM_MAX, BPM_MIN } from "#lib/utils/tapTempo.js";

	/**
	 * The chord player's Timing menu (docs/chord-player.md, "The Timing
	 * menu"), the Arpeggiator menu's shape: the session tempo by slider,
	 * steps, number or Tap, the beats to the bar, the pad's humanize, and
	 * the click, each explained in an InfoTip. The tempo and meter are the
	 * metronome's.
	 */
	const BEATS_PER_BAR = [2, 3, 4, 5, 6];
</script>

<div class="px-3 pb-4 pt-2 grid grid-cols-2 gap-3 text-light">
	<!-- Tempo -->
	<div class="col-span-full">
		<div class="flex items-center justify-between">
			<span class="block mb-2">Tempo · {metronome.bpm} bpm</span>
			<InfoTip
				text="The session tempo, the metronome's and the drum machine's wherever they share a page. The pad measures a held chord against it: about a beat, two or four. Tap the button in time and it takes your tempo."
			/>
		</div>
		<input
			class="w-full accent-maximumYellow"
			type="range"
			min={BPM_MIN}
			max={BPM_MAX}
			step="1"
			value={metronome.bpm}
			oninput={(e) => metronome.setBpm(Number(e.currentTarget.value))}
			aria-label="Tempo"
		/>
		<div class="flex items-center gap-1 mt-2">
			{#each [-5, -1] as d (d)}
				<button
					class="device-button-sm px-2 !min-w-0 tabular-nums"
					type="button"
					aria-label="Tempo {d}"
					onclick={() => metronome.setBpm(metronome.bpm + d)}>{d}</button
				>
			{/each}
			<button
				class="device-button-sm px-4"
				type="button"
				title="Tap the tempo"
				onclick={() => metronome.tap()}>Tap</button
			>
			{#each [1, 5] as d (d)}
				<button
					class="device-button-sm px-2 !min-w-0 tabular-nums"
					type="button"
					aria-label="Tempo +{d}"
					onclick={() => metronome.setBpm(metronome.bpm + d)}>+{d}</button
				>
			{/each}
			<input
				class="device-field w-18 ml-auto py-1 text-center text-13px tabular-nums"
				type="number"
				min={BPM_MIN}
				max={BPM_MAX}
				step="1"
				value={metronome.bpm}
				onchange={(e) => metronome.setBpm(Number(e.currentTarget.value))}
				aria-label="Tempo in beats per minute"
			/>
		</div>
	</div>

	<hr class="border-current/30 mt-2 col-span-full" />

	<!-- Beats to the Bar -->
	<label class="block">
		<div class="flex items-center justify-between">
			<span class="block mb-2">Beats to the Bar</span>
			<InfoTip
				text="Two to six: how the pad groups its bars, and where the arpeggiator's and the strum's patterns line up."
			/>
		</div>
		<ComboBox
			ariaLabel="Beats to the bar"
			value={String(metronome.beatsPerBar)}
			onchange={(v) => metronome.setBeats(Number(v))}
			options={BEATS_PER_BAR.map((n) => ({ value: String(n), label: String(n) }))}
		/>
	</label>

	<!-- Beat -->
	{#if metronome.running}
		<div class="self-end pb-2 text-12px opacity-70 tabular-nums">
			beat {metronome.beat + 1} of {metronome.beatsPerBar}
		</div>
	{/if}

	<hr class="border-current/30 mt-2 col-span-full" />

	<!-- Humanize -->
	<label class="block col-span-full">
		<div class="flex items-center justify-between">
			<span class="block mb-2">Humanize · {Math.round(progressionPad.humanize * 100)}%</span>
			<InfoTip
				text="The pad's chords land a little early or late and a little louder or softer when it plays back, as a hand would, and the MIDI it saves carries the same. 0 is exact."
			/>
		</div>
		<input
			class="w-full accent-maximumYellow"
			type="range"
			min="0"
			max="100"
			step="5"
			value={Math.round(progressionPad.humanize * 100)}
			aria-label="Humanize in percent"
			oninput={(e) => progressionPad.setHumanize(Number(e.currentTarget.value) / 100)}
		/>
	</label>

	<hr class="border-current/30 mt-2 col-span-full" />

	<!-- Click -->
	<label class="flex items-center gap-2">
		<input
			type="checkbox"
			class="accent-maximumYellow inline-block"
			checked={metronome.running}
			onchange={() => metronome.toggle()}
		/>
		<span>Click</span>
		<InfoTip
			text="A metronome at this tempo to play along to while you jot, the same click the pad's playback keeps under it. The Metronome button on the face does the same."
		/>
	</label>
</div>
