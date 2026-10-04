<script lang="ts">
	import {
		ARP_PATTERNS,
		ARP_RATES,
		type Arpeggiator,
		type ArpPattern,
		type ArpRate,
	} from "$lib/audio/arpeggiator.svelte";
	import { metronome } from "$lib/audio/metronome.svelte";
	import { TEMPO_RATIOS, type TempoRatio } from "$lib/constants/tempo";

	/**
	 * An arpeggiator's settings (audio/arpeggiator.svelte.ts), the one menu
	 * for the chord player's and the piano's: rate, tempo ratio, pattern,
	 * octaves, gate, the session swing, latch, bar alignment and changes on
	 * the beat. `intro` says what the owner arpeggiates; `changesLabel`
	 * names the on-beat switch in the owner's words.
	 */
	interface Props {
		arp: Arpeggiator<unknown>;
		intro: string;
		changesLabel?: string;
		/** What the swing is shared with, for the slider's note. */
		swingNote?: string;
	}
	let {
		arp,
		intro,
		changesLabel = "Changes land on the beat",
		swingNote = "One swing for the session: the drum machine's too.",
	}: Props = $props();
</script>

<div class="px-3 pt-3 pb-4 grid gap-4 [&_span.device-button-label]-(block mb-2 text-blue-100/90)">
	<p class="text-12px opacity-70 -mt-1">{intro}</p>
	<div class="grid gap-4">
		<label class="block">
			<span class="device-button-label">Rate</span>
			<select
				class="device-field w-full"
				value={arp.rate}
				onchange={(e) => arp.setRate(e.currentTarget.value as ArpRate)}
			>
				{#each ARP_RATES as r (r.id)}<option value={r.id}>{r.label}</option>{/each}
			</select>
		</label>
		<label class="block">
			<span class="device-button-label">Tempo</span>
			<select
				class="device-field w-full"
				value={String(arp.tempoRatio)}
				onchange={(e) => arp.setTempoRatio(Number(e.currentTarget.value) as TempoRatio)}
			>
				{#each TEMPO_RATIOS as r (r.id)}<option value={String(r.id)}
						>{r.label}{r.id === 1 ? ` (${metronome.bpm} bpm)` : ""}</option
					>{/each}
			</select>
			<span class="block text-12px opacity-70 mt-1"
				>The pattern runs at the session tempo (the metronome's, shared with the drums), or at half
				or double it.</span
			>
		</label>
		<label class="block">
			<span class="device-button-label">Pattern</span>
			<select
				class="device-field w-full"
				value={arp.pattern}
				onchange={(e) => arp.setPattern(e.currentTarget.value as ArpPattern)}
			>
				{#each ARP_PATTERNS as r (r.id)}<option value={r.id}>{r.label}</option>{/each}
			</select>
		</label>
		<label class="block">
			<span class="device-button-label">Octaves · {arp.octaves}</span>
			<input
				class="w-full accent-maximumYellow"
				type="range"
				min="1"
				max="3"
				step="1"
				value={arp.octaves}
				aria-label="Arpeggiator octaves"
				oninput={(e) => arp.setOctaves(Number(e.currentTarget.value))}
			/>
			<span class="block text-12px opacity-70 mt-1"
				>The pattern climbs through this many octaves before it repeats.</span
			>
		</label>
		<label class="block">
			<span class="device-button-label">Gate · {Math.round(arp.gate * 100)}%</span>
			<input
				class="w-full accent-maximumYellow"
				type="range"
				min="10"
				max="100"
				step="5"
				value={Math.round(arp.gate * 100)}
				aria-label="Arpeggiator gate in percent"
				oninput={(e) => arp.setGate(Number(e.currentTarget.value) / 100)}
			/>
			<span class="block text-12px opacity-70 mt-1"
				>How much of each step the note sounds: short and clipped, or running into the next.</span
			>
		</label>
		<label class="block">
			<span class="device-button-label">Swing · {Math.round(metronome.swing * 100)}%</span>
			<input
				class="w-full accent-maximumYellow"
				type="range"
				min="0"
				max="100"
				step="5"
				value={Math.round(metronome.swing * 100)}
				aria-label="Swing in percent"
				oninput={(e) => metronome.setSwing(Number(e.currentTarget.value) / 100)}
			/>
			<span class="block text-12px opacity-70 mt-1"
				>Every second eighth or sixteenth lands late, up to a triplet feel at full. Quarter notes
				and triplets stay straight. {swingNote}</span
			>
		</label>
		{#if arp.canGuess}
			<label class="flex items-center gap-2 text-13px text-blue-100/90">
				<input
					type="checkbox"
					class="accent-maximumYellow"
					checked={arp.guess}
					onchange={(e) => arp.setGuess(e.currentTarget.checked)}
				/>
				A single key plays as a chord
			</label>
			<span class="block text-12px opacity-70 -mt-2"
				>One key held alone becomes the triad on its degree of the key lit on the keyboard (so the
				second degree of C major is D minor); with no key lit the white keys play C major's chords
				and the black keys major triads. Two or more keys play as held.</span
			>
		{/if}
		<label class="flex items-center gap-2 text-13px text-blue-100/90">
			<input
				type="checkbox"
				class="accent-maximumYellow"
				checked={arp.latch}
				onchange={(e) => arp.setLatch(e.currentTarget.checked)}
			/>
			Latch: the pattern keeps going after you let go, until the next chord or Esc
		</label>
		<label class="flex items-center gap-2 text-13px text-blue-100/90">
			<input
				type="checkbox"
				class="accent-maximumYellow"
				checked={arp.align}
				onchange={(e) => arp.setAlign(e.currentTarget.checked)}
			/>
			Patterns line up with bars
		</label>
		<label class="flex items-center gap-2 text-13px text-blue-100/90">
			<input
				type="checkbox"
				class="accent-maximumYellow"
				checked={arp.onBeat}
				onchange={(e) => arp.setOnBeat(e.currentTarget.checked)}
			/>
			{changesLabel}
		</label>
		<span class="block text-12px opacity-70 -mt-2"
			>A new chord joins the running grid at the next quarter (eighth in sixteenths), whether the
			last is still held, latched or let go a moment ago: pressed just before, it waits for it;
			pressed just after, it comes in on the next step in its place. Off, a new chord restarts the
			pattern as you press it.</span
		>
		<label class="block">
			<span class="device-button-label">Line up every</span>
			<select
				class="device-field w-full"
				value={String(arp.alignBars)}
				disabled={!arp.align}
				onchange={(e) => arp.setAlignBars(Number(e.currentTarget.value) as 1 | 2)}
			>
				<option value="1">1 bar</option>
				<option value="2">2 bars</option>
			</select>
			<span class="block text-12px opacity-70 mt-1"
				>The pattern starts again from its first note at every bar (or two), whatever was left of
				it, so it lands the same way each time.</span
			>
		</label>
	</div>
</div>
