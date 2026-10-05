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
	import InfoTip from "$lib/components/InfoTip.svelte";
	import ComboBox from "$lib/components/ComboBox.svelte";

	/**
	 * An arpeggiator's settings (audio/arpeggiator.svelte.ts), the one menu
	 * for the chord player's and the piano's: rate, tempo ratio, pattern,
	 * octaves, gate, the session swing, latch, bar alignment and changes on
	 * the beat, the explanations in InfoTips (Kevin's pass). `changesLabel`
	 * names the on-beat switch in the owner's words.
	 */
	interface Props {
		arp: Arpeggiator<unknown>;
		changesLabel?: string;
		/** What the swing is shared with, for the slider's note. */
		swingNote?: string;
	}
	let {
		arp,
		changesLabel = "Changes land on the beat",
		swingNote = "One swing for the session: the drum machine's too.",
	}: Props = $props();
</script>

<div class="px-3 pb-4 pt-2 grid gap-4 text-light">
	<div class="grid gap-4">
		<!-- Rate -->
		<label class="block">
			<div class="flex items-center justify-between">
				<span class="block mb-2">Rate</span>
				<InfoTip text="Quarter, eighth, triplet or sixteenth notes at the tempo." />
			</div>
			<ComboBox
				ariaLabel="Arpeggiator rate"
				value={arp.rate}
				onchange={(v) => arp.setRate(v as ArpRate)}
				options={ARP_RATES.map((r) => ({ value: r.id, label: r.label }))}
			/>
		</label>

		<!-- Tempo -->
		<label class="block">
			<div class="flex items-center justify-between">
				<span class="block mb-2">Tempo</span>
				<InfoTip
					text="The pattern runs at the session tempo (the metronome's, shared with the drums), or at half or double it."
				/>
			</div>
			<ComboBox
				ariaLabel="Arpeggiator tempo"
				value={String(arp.tempoRatio)}
				onchange={(v) => arp.setTempoRatio(Number(v) as TempoRatio)}
				options={TEMPO_RATIOS.map((r) => ({
					value: String(r.id),
					label: r.id === 1 ? `${r.label} · ${metronome.bpm} bpm` : r.label,
				}))}
			/>
		</label>

		<!-- Pattern -->
		<label class="block">
			<div class="flex items-center justify-between">
				<span class="block mb-2">Pattern</span>
				<InfoTip text="Up, down, up and down, as played, or at random through the held notes." />
			</div>
			<ComboBox
				ariaLabel="Arpeggiator pattern"
				value={arp.pattern}
				onchange={(v) => arp.setPattern(v as ArpPattern)}
				options={ARP_PATTERNS.map((r) => ({ value: r.id, label: r.label }))}
			/>
		</label>

		<!-- Alignment -->
		<label class="block">
			<div class="flex items-center justify-between">
				<span class="block mb-2">Alignment</span>
				<InfoTip
					text="With patterns lined up with bars, the pattern starts again from its first note at every bar (or two), whatever was left of it, so it lands the same way each time."
				/>
			</div>
			<ComboBox
				ariaLabel="Line the pattern up every"
				disabled={!arp.align}
				value={String(arp.alignBars)}
				onchange={(v) => arp.setAlignBars(Number(v) as 1 | 2)}
				options={[
					{ value: "1", label: "1 bar" },
					{ value: "2", label: "2 bars" },
				]}
			/>
		</label>

		<hr class="border-current/30 mt-2" />

		<!-- Octaves -->
		<label class="block">
			<div class="flex justify-between items-center">
				<span class="block mb-2">Octaves · {arp.octaves} </span>
				<InfoTip text="The pattern climbs through this many octaves before it repeats." />
			</div>
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
		</label>

		<!-- Gate -->
		<label class="block">
			<div class="flex items-center justify-between">
				<span class="block mb-2">Gate · {Math.round(arp.gate * 100)}% </span>
				<InfoTip
					text="How much of each step the note sounds: short and clipped, or running into the next."
				/>
			</div>
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
		</label>

		<!-- Swing -->
		<label class="block">
			<div class="flex items-center justify-between">
				<span class="block mb-2">Swing · {Math.round(metronome.swing * 100)}%</span>
				<InfoTip
					text="Every second eighth or sixteenth lands late, up to a triplet feel at full. Quarter notes
				and triplets stay straight. {swingNote}"
				/>
			</div>
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
		</label>

		<hr class="border-current/30 mt-2" />

		<!-- Key Plays Chord -->
		{#if arp.canGuess}
			<label class="flex items-center gap-2">
				<input
					type="checkbox"
					class="accent-maximumYellow inline-block"
					checked={arp.guess}
					onchange={(e) => arp.setGuess(e.currentTarget.checked)}
				/>

				<span>A single key plays as a chord</span>

				<InfoTip
					text="One key held alone becomes the triad on its degree of the key lit on the keyboard (so the
				second degree of C major is D minor); with no key lit the white keys play C major's chords
				and the black keys major triads. Two or more keys play as held."
				/>
			</label>
		{/if}

		<!-- latch -->
		<label class="flex items-center gap-2">
			<input
				type="checkbox"
				class="accent-maximumYellow inline-block"
				checked={arp.latch}
				onchange={(e) => arp.setLatch(e.currentTarget.checked)}
			/>
			<span>Latch</span>
			<InfoTip text="the pattern keeps going after you let go, until the next chord or Esc" />
		</label>

		<!-- pattern lines up with bars -->
		<label class="flex items-center gap-2">
			<input
				type="checkbox"
				class="accent-maximumYellow"
				checked={arp.align}
				onchange={(e) => arp.setAlign(e.currentTarget.checked)}
			/>
			Patterns line up with bars
		</label>

		<!-- changes land on beat -->
		<label class="flex items-center gap-2">
			<input
				type="checkbox"
				class="accent-maximumYellow inline-block"
				checked={arp.onBeat}
				onchange={(e) => arp.setOnBeat(e.currentTarget.checked)}
			/>
			<span>{changesLabel}</span>
			<InfoTip
				text="A new chord joins the running grid at the next quarter (eighth in sixteenths), whether the
				last is still held, latched or let go a moment ago: pressed just before, it waits for it;
				pressed just after, it comes in on the next step in its place. Off, a new chord restarts the
				pattern as you press it."
			/>
		</label>
	</div>
</div>
