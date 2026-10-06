<script lang="ts">
	import type { Snippet } from "svelte";
	import { chordPlayer } from "$lib/audio/chordPlayer.svelte";
	import { SEVENTH_TYPES, type SeventhType } from "$lib/constants/circleOfFifths";
	import ComboBox from "$lib/components/ComboBox.svelte";
	import InfoTip from "$lib/components/InfoTip.svelte";

	/**
	 * The chord player's Chord Palette menu (docs/chord-player.md, "Styles":
	 * a palette is a chord style in the app's words), the Arpeggiator menu's
	 * shape: the seventh a major chord takes, explained in an InfoTip, and
	 * below a divider the owner's controls for palettes of its own.
	 */
	interface Props {
		/** New, Edit and Delete and the editor, for a member who can edit. */
		editor?: Snippet;
	}
	let { editor }: Props = $props();
</script>

<div class="px-3 pb-4 pt-2 grid grid-cols-2 gap-3 text-light">
	<!-- Seventh -->
	<label class="block">
		<div class="flex items-center justify-between">
			<span class="block mb-2">Seventh on Major Chords</span>
			<InfoTip
				text="A minor chord always takes the minor seventh. Hold the 7 pad or Shift for a seventh; a second finger on a sounding wedge adds it too."
			/>
		</div>
		<ComboBox
			ariaLabel="The seventh on a major chord"
			value={chordPlayer.seventhType}
			onchange={(v) => chordPlayer.setSeventhType(v as SeventhType)}
			options={SEVENTH_TYPES.map((t) => ({ value: t.id, label: t.label }))}
		/>
	</label>

	{#if editor}
		<hr class="border-current/30 mt-2 col-span-full" />
		<div class="col-span-full">{@render editor()}</div>
	{/if}
</div>
