<script lang="ts">
	import { chordPlayer, type NoteReadout } from "$lib/audio/chordPlayer.svelte";
	import { KEY_CENTERS, type ChordKeyMap } from "$lib/constants/circleOfFifths";
	import ComboBox from "$lib/components/ComboBox.svelte";
	import InfoTip from "$lib/components/InfoTip.svelte";

	/**
	 * The chord player's UI menu (docs/chord-player.md), the Arpeggiator
	 * menu's shape: the layout, where the key sits, the key center, the
	 * readout's notes and the computer keyboard's map as ComboBoxes, the key
	 * signatures and the dim outside the key as switches, each explained in
	 * an InfoTip.
	 */
	const KEY_OPTIONS = KEY_CENTERS.map((k, i) => ({ value: String(i), label: k.label }));
</script>

<div class="px-3 pb-4 pt-2 grid grid-cols-2 gap-3 text-light">
	<!-- Layout -->
	<label class="block">
		<div class="flex items-center justify-between">
			<span class="block mb-2">Layout</span>
			<InfoTip
				text="The arch: the key and three fifths each way, the chords a song mostly uses, drawn big, the four far keys as straight buttons. The circle: all twelve round the ring."
			/>
		</div>
		<ComboBox
			ariaLabel="Layout"
			value={chordPlayer.layout}
			onchange={(v) => chordPlayer.setLayout(v as "circle" | "arch")}
			options={[
				{ value: "arch", label: "Arch" },
				{ value: "circle", label: "Circle" },
			]}
		/>
	</label>

	<!-- Key Position -->
	<label class="block">
		<div class="flex items-center justify-between">
			<span class="block mb-2">Key Position</span>
			<InfoTip text="The circle turns so your song's key sits at the bottom, or at the top." />
		</div>
		<ComboBox
			ariaLabel="Where the key sits"
			value={chordPlayer.keyAtTop ? "top" : "bottom"}
			onchange={(v) => chordPlayer.setKeyAtTop(v === "top")}
			options={[
				{ value: "bottom", label: "At the bottom" },
				{ value: "top", label: "At the top" },
			]}
		/>
	</label>

	<!-- Key Center -->
	<label class="block">
		<div class="flex items-center justify-between">
			<span class="block mb-2">Key Center</span>
			<InfoTip
				text="Your song's key, the Key buttons' choice: the chords of the key light and the keyboard's degrees count from it."
			/>
		</div>
		<ComboBox
			ariaLabel="Key center"
			value={String(chordPlayer.keyCenter)}
			onchange={(v) => chordPlayer.setKeyCenter(Number(v))}
			options={KEY_OPTIONS}
		/>
	</label>

	<!-- Readout -->
	<label class="block">
		<div class="flex items-center justify-between">
			<span class="block mb-2">Notes in the Readout</span>
			<InfoTip
				text="Under the chord's name in the middle: its notes written out, on a small treble staff, both, or neither."
			/>
		</div>
		<ComboBox
			ariaLabel="Notes in the readout"
			value={chordPlayer.noteReadout}
			onchange={(v) => chordPlayer.setNoteReadout(v as NoteReadout)}
			options={[
				{ value: "names", label: "Written" },
				{ value: "staff", label: "On a staff" },
				{ value: "both", label: "Both" },
				{ value: "off", label: "Off" },
			]}
		/>
	</label>

	<!-- Computer Keyboard -->
	<label class="block">
		<div class="flex items-center justify-between">
			<span class="block mb-2">Computer Keyboard</span>
			<InfoTip
				text="By degree: 1 to 7 play the chords of the key, Q to U their minors. Round the circle: the number row plays the twelve majors clockwise from your key, the row below the minors. The keyboard button's labels follow."
			/>
		</div>
		<ComboBox
			ariaLabel="Computer keyboard map"
			value={chordPlayer.keyMap}
			onchange={(v) => chordPlayer.setKeyMap(v as ChordKeyMap)}
			options={[
				{ value: "degree", label: "By degree" },
				{ value: "circle", label: "Round the circle" },
			]}
		/>
	</label>

	<hr class="border-current/30 mt-2 col-span-full" />

	<!-- Key Signatures -->
	<label class="flex items-center gap-2">
		<input
			type="checkbox"
			class="accent-maximumYellow inline-block"
			checked={chordPlayer.showSignatures}
			onchange={(e) => chordPlayer.setShowSignatures(e.currentTarget.checked)}
		/>
		<span>Show Key Signatures</span>
		<InfoTip text="Each key's sharps or flats written on its wedge." />
	</label>

	<!-- Dim outside the key -->
	<label class="flex items-center gap-2">
		<input
			type="checkbox"
			class="accent-maximumYellow inline-block"
			checked={chordPlayer.highlightKey}
			onchange={(e) => chordPlayer.setHighlightKey(e.currentTarget.checked)}
		/>
		<span>Dim Outside the Key</span>
		<InfoTip text="The six chords of the key stay bright and the rest fade back." />
	</label>
</div>
