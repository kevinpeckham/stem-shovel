<script lang="ts">
	import {
		chordPlayer,
		type ChordAccent,
		type StrumDirection,
	} from "$lib/audio/chordPlayer.svelte";
	import {
		AUTO_STRUM_PATTERNS,
		AUTO_STRUM_SPEEDS,
		type AutoStrumPatternId,
		type AutoStrumSpeed,
	} from "$lib/constants/autoStrum";
	import { STRUMS, type Strum } from "$lib/constants/circleOfFifths";
	import { metronome } from "$lib/audio/metronome.svelte";
	import ComboBox from "$lib/components/ComboBox.svelte";
	import InfoTip from "$lib/components/InfoTip.svelte";

	/**
	 * The chord player's strum settings (docs/chord-player.md, "Strum"), the
	 * Arpeggiator menu's shape: the sweep (speed, direction, accent), the
	 * pattern a held wedge strums in (pattern, rate, the session swing) and
	 * the latch, each explained in an InfoTip.
	 */
</script>

<div class="px-3 pb-4 pt-2 grid grid-cols-2 gap-3 text-light">
	<!-- Speed -->
	<label class="block">
		<div class="flex items-center justify-between">
			<span class="block mb-2">Speed</span>
			<InfoTip
				text="How far apart the notes fall as the hand sweeps across them. Off plays them together, as the Strum button does."
			/>
		</div>
		<ComboBox
			ariaLabel="Strum speed"
			value={chordPlayer.strum}
			onchange={(v) => chordPlayer.setStrum(v as Strum)}
			options={STRUMS.map((s) => ({ value: s.id, label: s.label }))}
		/>
	</label>

	<!-- Direction -->
	<label class="block">
		<div class="flex items-center justify-between">
			<span class="block mb-2">Direction</span>
			<InfoTip
				text="Down sweeps from the lowest note up, Up from the highest down, and Alternate turns over each time through the pattern (press by press with Once)."
			/>
		</div>
		<ComboBox
			ariaLabel="Strum direction"
			value={chordPlayer.strumDirection}
			onchange={(v) => chordPlayer.setStrumDirection(v as StrumDirection)}
			options={[
				{ value: "down", label: "Down" },
				{ value: "up", label: "Up" },
				{ value: "alternate", label: "Alternate" },
			]}
		/>
	</label>

	<!-- Pattern -->
	<label class="block">
		<div class="flex items-center justify-between">
			<span class="block mb-2">Pattern</span>
			<InfoTip
				text="With the strum on, a press strums the chord; holding the wedge strums it again and again in this pattern at the session tempo, down and up strokes as a guitarist's hand. Once keeps to the press. The arpeggiator takes over while it is on."
			/>
		</div>
		<ComboBox
			ariaLabel="Strum pattern"
			value={chordPlayer.strumPattern}
			onchange={(v) => chordPlayer.setStrumPattern(v as AutoStrumPatternId)}
			options={AUTO_STRUM_PATTERNS.map((p) => ({ value: p.id, label: p.label }))}
		/>
	</label>

	<!-- Rate -->
	<label class="block">
		<div class="flex items-center justify-between">
			<span class="block mb-2">Rate</span>
			<InfoTip
				text="Each slot of the pattern is an eighth, or a sixteenth, at the session tempo ({metronome.bpm} bpm) and the arpeggiator's tempo ratio."
			/>
		</div>
		<ComboBox
			ariaLabel="Strum pattern rate"
			disabled={chordPlayer.strumPattern === "once"}
			value={chordPlayer.strumSpeed}
			onchange={(v) => chordPlayer.setStrumSpeed(v as AutoStrumSpeed)}
			options={AUTO_STRUM_SPEEDS.map((s) => ({ value: s.id, label: s.label }))}
		/>
	</label>

	<hr class="border-current/30 mt-2 col-span-full" />

	<!-- Accent -->
	<label class="block">
		<div class="flex items-center justify-between">
			<span class="block mb-2">Accent</span>
			<InfoTip
				text="Which note of the chord lands hardest: the top (the melody note), the bottom (the bass), or none."
			/>
		</div>
		<ComboBox
			ariaLabel="Chord accent"
			value={chordPlayer.accent}
			onchange={(v) => chordPlayer.setAccent(v as ChordAccent)}
			options={[
				{ value: "none", label: "Even" },
				{ value: "top", label: "Top note" },
				{ value: "bottom", label: "Bottom note" },
			]}
		/>
	</label>

	<!-- Swing -->
	<label class="block">
		<div class="flex items-center justify-between">
			<span class="block mb-2">Swing · {Math.round(chordPlayer.swing * 100)}%</span>
			<InfoTip
				text="Every second slot lands late, up to a triplet feel at full. One swing for the chord player: the arpeggiator's and the drum machine's too."
			/>
		</div>
		<input
			class="w-full accent-maximumYellow"
			type="range"
			min="0"
			max="100"
			step="5"
			value={Math.round(chordPlayer.swing * 100)}
			aria-label="Swing in percent"
			oninput={(e) => chordPlayer.setSwing(Number(e.currentTarget.value) / 100)}
		/>
	</label>

	<hr class="border-current/30 mt-2 col-span-full" />

	<!-- Latch -->
	<label class="flex items-center gap-2">
		<input
			type="checkbox"
			class="accent-maximumYellow inline-block"
			checked={chordPlayer.strumLatch}
			onchange={(e) => chordPlayer.setStrumLatch(e.currentTarget.checked)}
		/>
		<span>Latch</span>
		<InfoTip
			text="The pattern keeps going after you let go, until the next chord or Esc. Double-click or double-tap the Strum button to latch and unlatch."
		/>
	</label>
</div>
