<script lang="ts">
	import { metronome } from "$lib/audio/metronome.svelte";
	import { BEATS_PER_BAR } from "$lib/utils/metronomePreferences";
	import { BPM_MAX, BPM_MIN } from "$lib/utils/tapTempo";
	import { onMount } from "svelte";

	/**
	 * A view of the page's one metronome (src/lib/audio/metronome.svelte.ts).
	 * Full: tempo readout with steps and a slider, beats to the bar, tap
	 * tempo, a beat indicator, Start / Stop. Compact: a toggle with the icon
	 * and, when on, the tempo to adjust; for a device's control row or a
	 * menu. Several views on one page show the same click.
	 */
	interface Props {
		compact?: boolean;
		/** Compact only: when the tempo field shows. "auto" is while running. */
		tempo?: "auto" | "always" | "never";
		/** Compact only: the toggle shows the metronome icon, or the words On / Off (for a menu row that names it already). */
		toggle?: "icon" | "text";
	}
	let { compact = false, tempo = "auto", toggle = "icon" }: Props = $props();
	let showTempo = $derived(tempo === "always" || (tempo === "auto" && metronome.running));

	onMount(() => metronome.load());
</script>

{#if compact}
	<div class="flex items-center gap-1" aria-label="Metronome">
		<button
			class="button button-sm shrink-0 {metronome.running
				? 'bg-accent text-oxford border-accent opacity-100'
				: ''}"
			type="button"
			aria-pressed={metronome.running}
			title={metronome.running ? "Stop the metronome" : "Start the metronome"}
			aria-label={metronome.running ? "Stop the metronome" : "Start the metronome"}
			onclick={() => metronome.toggle()}
		>
			{#if toggle === "text"}
				<span class="w-5 text-center" aria-hidden="true">{metronome.running ? "On" : "Off"}</span>
			{:else}
				<span
					class="i-ph-metronome {metronome.running && metronome.beat === 0
						? 'scale-125'
						: ''} transition-transform"
					aria-hidden="true"
				></span>
			{/if}
		</button>
		{#if showTempo}
			<label class="flex items-center gap-1 text-13px">
				<span class="sr-only">Tempo</span>
				<input
					class="field w-16 py-1 text-center text-13px tabular-nums"
					type="number"
					min={BPM_MIN}
					max={BPM_MAX}
					step="1"
					value={metronome.bpm}
					onchange={(e) => metronome.setBpm(Number(e.currentTarget.value))}
					aria-label="Tempo in beats per minute"
				/>
				<span class="text-dim">bpm</span>
			</label>
		{/if}
	</div>
{:else}
	<div class="device-chrome grid gap-5 px-5 py-5 w-full max-w-600px" aria-label="Metronome">
		<!-- the readout -->
		<div class="device-window-bevel-md">
			<div class="device-screen grid place-items-center gap-2 py-5 text-blue-100">
				<div class="flex items-baseline gap-2 font-mono tabular-nums">
					<span class="text-56px leading-none">{metronome.bpm}</span>
					<span class="text-14px opacity-70">bpm</span>
				</div>
				<!-- the beat indicator: one light per beat, the first brighter -->
				<div
					class="flex items-center gap-2"
					role="img"
					aria-label="Beat {metronome.beat + 1} of {metronome.beatsPerBar}"
				>
					{#each Array.from({ length: metronome.beatsPerBar }, (_, i) => i) as i (i)}
						<span
							class="block h-3 w-3 rounded-full transition-colors {metronome.beat === i
								? i === 0
									? 'bg-accent'
									: 'bg-green-400'
								: 'bg-blue-100/15'}"
						></span>
					{/each}
				</div>
				<div class="text-12px font-mono opacity-70">
					{metronome.beatsPerBar} beats to the bar · {metronome.running ? "running" : "stopped"}
				</div>
			</div>
		</div>

		<!-- tempo: steps and a slider -->
		<div class="grid gap-2">
			<div class="flex items-center justify-center gap-2">
				{#each [-10, -1] as d (d)}
					<button
						class="device-button-lg !min-w-0 px-3"
						type="button"
						onclick={() => metronome.setBpm(metronome.bpm + d)}
					>
						{d}
					</button>
				{/each}
				<button
					class="device-button-lg !min-w-0 px-4"
					type="button"
					onclick={() => metronome.tap()}
					title="Tap the tempo"
				>
					Tap
				</button>
				{#each [1, 10] as d (d)}
					<button
						class="device-button-lg !min-w-0 px-3"
						type="button"
						onclick={() => metronome.setBpm(metronome.bpm + d)}
					>
						+{d}
					</button>
				{/each}
			</div>
			<label class="block">
				<span class="sr-only">Tempo</span>
				<input
					class="w-full accent-maximumYellow"
					type="range"
					min={BPM_MIN}
					max={BPM_MAX}
					step="1"
					value={metronome.bpm}
					oninput={(e) => metronome.setBpm(Number(e.currentTarget.value))}
					aria-label="Tempo in beats per minute"
				/>
			</label>
		</div>

		<!-- beats to the bar, and the switch -->
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div class="flex items-center gap-1" role="group" aria-label="Beats to the bar">
				{#each BEATS_PER_BAR as n (n)}
					<button
						class="device-button-lg !min-w-0 px-3 {metronome.beatsPerBar === n
							? 'text-accent'
							: ''}"
						type="button"
						aria-pressed={metronome.beatsPerBar === n}
						onclick={() => metronome.setBeats(n)}
					>
						{n}
					</button>
				{/each}
			</div>
			<button
				class="device-button-lg {metronome.running ? 'text-accent' : ''}"
				type="button"
				aria-pressed={metronome.running}
				onclick={() => metronome.toggle()}
			>
				<span class="i-ph-metronome" aria-hidden="true"></span>
				{metronome.running ? "Stop" : "Start"}
			</button>
		</div>
	</div>
{/if}
