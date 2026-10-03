<script lang="ts">
	import { onDestroy, type Snippet } from "svelte";
	import { chordPlayer } from "$lib/audio/chordPlayer.svelte";
	import { metronome } from "$lib/audio/metronome.svelte";
	import { progressionPad } from "$lib/audio/progression.svelte";
	import { piano } from "$lib/audio/piano.svelte";
	import CircleOfFifths from "$lib/components/CircleOfFifths.svelte";
	import ComboBox from "$lib/components/ComboBox.svelte";
	import ContextMenu from "$lib/components/ContextMenu.svelte";
	import PianoEffectsMenu from "$lib/components/PianoEffectsMenu.svelte";
	import ProgressionPad from "$lib/components/ProgressionPad.svelte";
	import {
		CHORD_VOICINGS,
		CIRCLE_OF_FIFTHS,
		KEY_CENTERS,
		SEVENTH_TYPES,
		STRUMS,
		type ChordKeyMap,
		type ChordQuality,
		type ChordVoicing,
		type SeventhType,
		type Strum,
	} from "$lib/constants/circleOfFifths";
	import { CHORD_STYLES } from "$lib/constants/chordStyles";
	import ChordStyleEditor from "$lib/components/ChordStyleEditor.svelte";
	import { deleteChordStyle, saveChordStyle } from "$lib/remote/chordStyles.remote";
	import { notify } from "$lib/state/notifications.svelte";
	import { builtinStyleData } from "$lib/utils/builtinStyleData";
	import { errorMessage } from "$lib/utils/errorMessage";
	import type { ChordStyleData, SavedChordStyle } from "$lib/val/ChordStyleSchema";
	import { PIANO_INSTRUMENTS, type PianoInstrumentId } from "$lib/constants/piano";
	import { PIANO_PRESET_SLOTS } from "$lib/val/PianoPresetSchema";
	import { isTextEntry } from "$lib/utils/isTextEntry";
	import { loadPianoSlotOverrides } from "$lib/utils/pianoSlotOverrides";
	import { pianoPresetKey } from "$lib/utils/pianoPresetKey";
	import { resolvePianoSlots } from "$lib/utils/resolvePianoSlots";
	import type { NamedPianoPreset, PianoPresetData } from "$lib/val/PianoPresetSchema";
	import type { SavedProgression } from "$lib/val/ProgressionSchema";
	import { BPM_MAX, BPM_MIN } from "$lib/utils/tapTempo";

	/**
	 * The Chord Player device (docs/chord-player.md): the circle of fifths
	 * played through the piano engine, with the piano's Sound, Effects,
	 * Presets and Volume beside its own Chords and Circle menus. Presets
	 * here load; saving and managing them is the piano page's.
	 */
	interface SavedPreset {
		id: string;
		name: string;
		slot: number | null;
		data: PianoPresetData;
	}
	interface Props {
		/** The computer keyboard plays; off where a page needs the keys for something else. */
		keyboard?: boolean;
		/** Fetch the Grand Piano's samples at mount (the page); off, they come with the first touch. */
		warm?: boolean;
		samplesBase?: string | null;
		sitePresets?: (NamedPianoPreset | null)[] | null;
		account?: { id: string; name: string; canEdit: boolean } | null;
		presets?: SavedPreset[];
		/** The account's saved progressions, for the pad. */
		progressions?: SavedProgression[];
		/** The progression pad under the circle (off where the circle alone is wanted, as on the home page). */
		pad?: boolean;
		/** The saved list as the pad keeps it, bound so the page's notes panel and the pad share one. */
		savedProgressions?: SavedProgression[];
		/** The account's custom chord styles. */
		chordStyles?: SavedChordStyle[];
	}
	let {
		keyboard = true,
		warm = false,
		samplesBase = null,
		sitePresets = null,
		account = null,
		presets = [],
		progressions = [],
		pad = true,
		savedProgressions = $bindable(progressions),
		chordStyles = [],
	}: Props = $props();

	// The engines, from the page's first render (they are shared singletons; `load` is idempotent).
	piano.samplesBase = samplesBase;
	piano.load(warm);
	chordPlayer.load();
	// svelte-ignore state_referenced_locally
	if (pad) progressionPad.load();
	// svelte-ignore state_referenced_locally
	chordPlayer.customStyles = chordStyles;

	// ---- custom styles (docs/chord-player.md, "Styles") ----
	let styleEditor = $state<{ id: string | null; name: string; data: ChordStyleData } | null>(null);
	let styleSaving = $state(false);
	const customStyleId = $derived(
		chordPlayer.style.startsWith("custom:") ? chordPlayer.style.slice(7) : null,
	);
	const currentCustom = $derived(
		customStyleId ? (chordPlayer.customStyles.find((s) => s.id === customStyleId) ?? null) : null,
	);
	function newStyle() {
		const base = currentCustom
			? structuredClone($state.snapshot(currentCustom.data))
			: builtinStyleData(chordPlayer.builtinStyle, chordPlayer.seventhType);
		const from =
			currentCustom?.name ?? CHORD_STYLES.find((s) => s.id === chordPlayer.builtinStyle)?.label;
		styleEditor = { id: null, name: `${from} (mine)`, data: base };
	}
	function editStyle() {
		if (!currentCustom) return;
		styleEditor = { id: currentCustom.id, name: currentCustom.name, data: currentCustom.data };
	}
	async function saveStyle(name: string, data: ChordStyleData) {
		if (!account || !styleEditor) return;
		styleSaving = true;
		try {
			const row = await saveChordStyle({
				accountId: account.id,
				id: styleEditor.id ?? undefined,
				name,
				data,
			});
			const entry = { id: row.id, name: row.name, data, updatedAt: new Date(row.updatedAt) };
			chordPlayer.customStyles = [
				entry,
				...chordPlayer.customStyles.filter((s) => s.id !== row.id),
			];
			chordPlayer.setStyle(`custom:${row.id}`);
			styleEditor = null;
			notify(`${row.name} saved to ${account.name}`);
		} catch (e) {
			notify(`Could not save the style: ${errorMessage(e)}`, { kind: "error" });
		} finally {
			styleSaving = false;
		}
	}
	async function removeStyle() {
		if (!currentCustom || !window.confirm(`Delete "${currentCustom.name}" from ${account?.name}?`))
			return;
		try {
			await deleteChordStyle({ id: currentCustom.id });
			chordPlayer.customStyles = chordPlayer.customStyles.filter((s) => s.id !== currentCustom.id);
			chordPlayer.setStyle("plain");
			notify(`${currentCustom.name} deleted`);
		} catch (e) {
			notify(`Could not delete the style: ${errorMessage(e)}`, { kind: "error" });
		}
	}
	const BEATS_PER_BAR = [2, 3, 4, 5, 6];

	const INSTRUMENT_OPTIONS = PIANO_INSTRUMENTS.map((i) => ({ value: i.id, label: i.label }));
	const instrumentLabel = (id: string) => PIANO_INSTRUMENTS.find((i) => i.id === id)?.label ?? id;
	const VOICING_OPTIONS = CHORD_VOICINGS.map((v) => ({
		value: v.id,
		label: v.label,
		description: v.hint,
	}));
	const KEY_OPTIONS = KEY_CENTERS.map((k, i) => ({ value: String(i), label: k.label }));
	const SLOT_NUMBERS = Array.from({ length: PIANO_PRESET_SLOTS }, (_, i) => i + 1);

	// ---- presets: the piano's, loaded here (docs/piano.md, "Presets") ----
	// svelte-ignore state_referenced_locally
	const site = $state<(NamedPianoPreset | null)[]>(sitePresets ?? []);
	// svelte-ignore state_referenced_locally
	const saved = $state<SavedPreset[]>(presets);
	let overrides = $state<Record<number, NamedPianoPreset>>({});
	if (typeof window !== "undefined") overrides = loadPianoSlotOverrides();
	let loaded = $state<NamedPianoPreset | null>(null);
	const slots = $derived(resolvePianoSlots(site, overrides, account ? saved : null));
	const currentKey = $derived(pianoPresetKey(piano.currentPreset()));
	const activeSlot = $derived(slots.findIndex((p) => p && pianoPresetKey(p.data) === currentKey));
	const presetLine = $derived.by(() => {
		const slot = activeSlot >= 0 ? slots[activeSlot] : null;
		if (slot) return { name: slot.name, edited: false };
		if (loaded) return { name: loaded.name, edited: pianoPresetKey(loaded.data) !== currentKey };
		return null;
	});
	function loadPreset(preset: NamedPianoPreset) {
		chordPlayer.allOff();
		piano.applyPreset(preset.data);
		loaded = { name: preset.name, data: preset.data };
	}

	// ---- the wedges ----
	const pressed = $derived(new Set(chordPlayer.sounding.map((s) => s.wedge)));
	const centre = $derived(chordPlayer.sounding.map((s) => s.name).join(" + "));
	const keyLabel = $derived(CIRCLE_OF_FIFTHS[chordPlayer.keyCenter].major.label);
	function press(index: number, quality: ChordQuality, pointerId: number) {
		chordPlayer.press(index, quality, `pointer:${pointerId}`);
	}
	function release(pointerId: number) {
		chordPlayer.release(`pointer:${pointerId}`);
	}
	/** The 7 pad: a seventh on every chord while it is held. */
	function seventhDown(e: PointerEvent) {
		e.preventDefault();
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		chordPlayer.seventhHeld = true;
	}
	function seventhUp() {
		chordPlayer.seventhHeld = false;
	}

	// ---- the computer keyboard ----
	const downCodes = new Set<string>();
	function onkeydown(e: KeyboardEvent) {
		if (!keyboard || e.metaKey || e.ctrlKey || e.altKey || isTextEntry(e.target)) return;
		if (e.key === "Shift") {
			chordPlayer.seventhHeld = true;
			return;
		}
		if (e.code === "Space") {
			e.preventDefault();
			piano.setSustain(true);
			return;
		}
		if (e.code === "Escape") {
			chordPlayer.allOff();
			return;
		}
		const key = chordPlayer.keyCodes[e.code];
		if (!key || e.repeat || downCodes.has(e.code)) return;
		e.preventDefault();
		downCodes.add(e.code);
		chordPlayer.press((key.position + chordPlayer.keyIndex) % 12, key.quality, `key:${e.code}`);
	}
	function onkeyup(e: KeyboardEvent) {
		if (e.key === "Shift") {
			chordPlayer.seventhHeld = false;
			return;
		}
		if (e.code === "Space") {
			piano.setSustain(false);
			return;
		}
		if (downCodes.delete(e.code)) chordPlayer.release(`key:${e.code}`);
	}
	function onblur() {
		downCodes.clear();
		chordPlayer.seventhHeld = false;
		chordPlayer.allOff();
	}
	onDestroy(() => {
		if (typeof window !== "undefined") {
			progressionPad.stop();
			chordPlayer.allOff();
		}
	});
</script>

<svelte:window {onkeydown} {onkeyup} {onblur} />

<div
	class="@container device-chrome grid gap-3 px-3 py-4 pb-20 @xl-pb-10 @xl-px-5 @xl-pt-5 w-full max-w-full relative"
	role="group"
	aria-label="Chord Player"
>
	<!-- the screen -->
	<div class="device-window-bevel-md">
		<div
			class="device-screen flex flex-wrap items-end justify-between gap-x-6 gap-y-2 px-4 py-3 transition-opacity {piano.on
				? ''
				: '[&>*]-(opacity-25)'}"
		>
			<div>
				<div class="text-24px @xl-text-32px leading-none">{instrumentLabel(piano.instrument)}</div>
				{#if presetLine}
					<div class="mt-1 text-13px @xl-text-14px opacity-85 flex items-center gap-1.5">
						<span class="i-ph-bookmark-simple text-12px" aria-hidden="true"></span>
						<span>{presetLine.name}{presetLine.edited ? " · edited" : ""}</span>
					</div>
				{/if}
				<div class="mt-2 text-12px opacity-70 flex flex-wrap gap-x-2">
					<span>Key of {keyLabel}</span>
					<span>· {chordPlayer.mode === "notes" ? "notes" : "chords"}</span>
					{#if chordPlayer.styleLabel}<span>· {chordPlayer.styleLabel}</span>{/if}
					<span
						>· {CHORD_VOICINGS.find((v) => v.id === chordPlayer.voicing)?.label.toLowerCase()}</span
					>
					{#if chordPlayer.seventhHeld}<span class="text-accent">· 7</span>{/if}
					{#if piano.instrument === "grand" && piano.samples === "loading"}
						<span>· loading the piano…</span>
					{:else if piano.instrument === "grand" && piano.samples === "failed"}
						<span class="text-red-300">· the piano's samples did not load</span>
					{/if}
					{#if !piano.on}<span>· {piano.starting ? "starting…" : "off"}</span>{/if}
				</div>
			</div>
			<div
				class="text-13px opacity-80 rounded border border-current/40 px-2 py-1 min-w-24 text-center tabular-nums"
				aria-live="polite"
			>
				{centre || (chordPlayer.mode === "notes" ? "note" : "chord")}
			</div>
		</div>
	</div>

	<!-- the controls above the circle: one row of a few buttons on a phone (captions, the key's arrows, the 7 pad and the rest fold away), the full set from @xl -->
	<div class="flex flex-nowrap @xl-flex-wrap items-end gap-2 @xl-gap-x-4 @xl-gap-y-3">
		<div>
			<div class="device-button-group-label text-dark hidden @xl-block">Power</div>
			<button
				class="device-button-sm px-3 {piano.on ? 'text-accent' : ''}"
				type="button"
				aria-pressed={piano.on}
				title={piano.on ? "Switch the sound off" : "Switch the sound on"}
				onclick={() => void piano.setOn(!piano.on)}
			>
				<span class="i-ph-power" aria-hidden="true"></span>
			</button>
		</div>
		<div class="min-w-28 @xl-min-w-36">
			<div class="device-button-group-label text-dark hidden @xl-block">Sound</div>
			<ComboBox
				ariaLabel="Sound"
				clearDefaultButtonClasses={true}
				buttonClasses="device-button-sm px-3 w-full"
				options={INSTRUMENT_OPTIONS}
				value={piano.instrument}
				onchange={(v) => {
					chordPlayer.allOff();
					piano.setInstrument(v as PianoInstrumentId);
				}}
			/>
		</div>
		<div class="hidden @xl-block">
			<div class="device-button-group-label text-dark hidden @xl-block">Play</div>
			{@render modeBlock()}
		</div>
		<div class="@xl-hidden">
			<ComboBox
				ariaLabel="Key center"
				clearDefaultButtonClasses={true}
				buttonClasses="device-button-sm px-3"
				options={KEY_OPTIONS}
				value={String(chordPlayer.keyCenter)}
				onchange={(v) => chordPlayer.setKeyCenter(Number(v))}
			/>
		</div>
		<div class="hidden @xl-block">
			<div class="device-button-group-label text-dark hidden @xl-block">Key</div>
			<div class="flex gap-px" role="group" aria-label="Key center">
				<button
					class="device-button-sm px-2 rounded-r-none"
					type="button"
					title="A fifth down"
					aria-label="Key center a fifth down"
					onclick={() => chordPlayer.setKeyCenter(chordPlayer.keyCenter - 1)}
				>
					<span class="i-ph-caret-left" aria-hidden="true"></span>
				</button>
				<span class="device-button-sm px-3 rounded-none min-w-12 justify-center">{keyLabel}</span>
				<button
					class="device-button-sm px-2 rounded-l-none"
					type="button"
					title="A fifth up"
					aria-label="Key center a fifth up"
					onclick={() => chordPlayer.setKeyCenter(chordPlayer.keyCenter + 1)}
				>
					<span class="i-ph-caret-right" aria-hidden="true"></span>
				</button>
			</div>
		</div>
		<div class="hidden @xl-block">
			<div class="device-button-group-label text-dark hidden @xl-block">Seventh</div>
			<button
				class="device-button-sm px-4 touch-none {chordPlayer.seventhHeld ? 'text-accent' : ''}"
				type="button"
				aria-pressed={chordPlayer.seventhHeld}
				title="Hold for a seventh on every chord (or hold Shift)"
				onpointerdown={seventhDown}
				onpointerup={seventhUp}
				onpointercancel={seventhUp}
				oncontextmenu={(e) => e.preventDefault()}>7</button
			>
		</div>
		<div class="hidden @xl-block">
			<div class="device-button-group-label text-dark hidden @xl-block">View</div>
			{@render keysBlock()}
		</div>
		<div class="hidden @xl-block">
			<div class="device-button-group-label text-dark hidden @xl-block">Presets</div>
			{@render presetsBlock()}
		</div>
		<div class="hidden @xl-block">
			<div class="device-button-group-label text-dark hidden @xl-block">Settings</div>
			<div class="flex flex-wrap gap-2">
				<ContextMenu
					ariaLabel="Timing"
					title="Tempo, tap, beats to the bar and the click"
					iconClass="i-ph-metronome"
					label="{metronome.bpm} bpm"
					position="bottom right"
					buttonBaseClasses="device-button-sm px-3 tabular-nums {metronome.running
						? 'text-accent'
						: ''}"
					popoverClasses="min-w-72 @xl-min-w-96 max-w-lg !max-h-[calc(100%-0.5rem)] overflow-y-auto"
					items={[
						{ id: "timing-heading", kind: "heading", label: "Timing" },
						{ id: "timing-block", kind: "snippet", snippet: timingMenuBlock },
					]}
				/>
				<ContextMenu
					ariaLabel="Chords settings"
					title="Voicing, the seventh, strum, velocity and octave"
					iconClass="i-ph-music-notes"
					label="Chords"
					position="bottom right"
					buttonBaseClasses="device-button-sm px-3"
					popoverClasses="min-w-72 @xl-min-w-96 max-w-lg !max-h-[calc(100%-0.5rem)] overflow-y-auto"
					items={[
						{ id: "chords-heading", kind: "heading", label: "Chords" },
						{ id: "chords-block", kind: "snippet", snippet: chordsMenuBlock },
					]}
				/>
				<ContextMenu
					ariaLabel="Circle settings"
					title="Where the key sits, the signatures, the dim outside the key"
					iconClass="i-ph-circle-dashed"
					label="Circle"
					position="bottom right"
					buttonBaseClasses="device-button-sm px-3"
					popoverClasses="min-w-72 @xl-min-w-96 max-w-lg !max-h-[calc(100%-0.5rem)] overflow-y-auto"
					items={[
						{ id: "circle-heading", kind: "heading", label: "Circle" },
						{ id: "circle-block", kind: "snippet", snippet: circleMenuBlock },
					]}
				/>
				<ContextMenu
					ariaLabel="Effects"
					title="The piano's effects: reverb, delay, chorus, tremolo, fuzz, wah, phaser, tone, rotary"
					iconClass="i-ph-sliders-horizontal"
					label="Effects"
					position="bottom right"
					buttonBaseClasses="device-button-sm px-3"
					popoverClasses="min-w-80 @xl-min-w-[40rem] max-w-4xl !max-h-[calc(100%-0.5rem)] overflow-y-auto"
					items={[
						{ id: "fx-heading", kind: "heading", label: "Effects" },
						{ id: "fx-block", kind: "snippet", snippet: effectsMenuBlock },
					]}
				/>
			</div>
		</div>
		<div class="hidden @xl-block @xl-ml-auto @xl-w-40">
			<div class="device-button-group-label text-dark hidden @xl-block">Volume</div>
			{@render volumeBlock()}
		</div>
		<!-- A phone: the mode, the keys, the presets, the settings and the volume in one wrench menu, as the piano's. -->
		<div class="@xl-hidden ml-auto">
			<div class="device-button-group-label text-dark hidden @xl-block">More</div>
			<ContextMenu
				ariaLabel="Chord player menu"
				title="Mode, keys, presets, settings and volume"
				iconClass="i-ph-wrench"
				position="bottom right"
				buttonBaseClasses="device-button-sm px-3"
				popoverClasses="min-w-80 max-w-[calc(100vw-1rem)] !max-h-[calc(100%-0.5rem)] overflow-y-auto"
				items={[
					{ id: "compact-heading", kind: "heading", label: "Chord Player" },
					{ id: "compact-body", kind: "snippet", snippet: compactMenuBlock },
				]}
			/>
		</div>
	</div>

	<!-- the circle: on a phone it runs to the device's edges and a little past them, so the wedges at three and nine o'clock end in a straight edge and every button is as big as the width allows (Kevin); from @xl, whole, up to 560px -->
	<div
		class="-mx-3 overflow-hidden @xl-mx-auto @xl-overflow-visible w-[calc(100%+1.5rem)] @xl-w-full {chordPlayer.layout ===
		'arch'
			? '@xl-max-w-700px'
			: '@xl-max-w-560px'} text-blue-100"
	>
		<CircleOfFifths
			class={chordPlayer.layout === "arch" ? "w-full" : "w-[114%] -ml-[7%] @xl-w-full @xl-ml-0"}
			positions={chordPlayer.positions}
			notes={chordPlayer.notes}
			mode={chordPlayer.mode}
			layout={chordPlayer.drawnLayout}
			showSignatures={chordPlayer.showSignatures}
			showKeys={chordPlayer.showKeys}
			keyLabels={chordPlayer.keyLabels}
			keyIndex={chordPlayer.keyIndex}
			showNumerals={chordPlayer.showNumerals}
			highlightKey={chordPlayer.highlightKey}
			{pressed}
			{centre}
			onpress={press}
			onrelease={release}
		/>
	</div>
	<!-- With the key labels up, the rest of the keyboard: a strip of shortcuts under the circle (Kevin). -->
	{#if chordPlayer.showKeys && keyboard}
		<div
			class="flex flex-wrap justify-center gap-x-4 gap-y-1 text-12px text-dark [&_kbd]-(inline-block rounded border border-current/40 px-1.5 py-px font-mono text-11px leading-tight)"
			aria-label="Keyboard shortcuts"
		>
			<span><kbd>Space</kbd> sustain</span>
			<span><kbd>Shift</kbd> seventh</span>
			<span><kbd>Esc</kbd> all off</span>
			{#if chordPlayer.keyMap === "degree"}
				<span><kbd>1</kbd>–<kbd>7</kbd> I–VII</span>
				<span><kbd>8</kbd>–<kbd>=</kbd> ♭II ♭III ♯IV ♭VI ♭VII</span>
				<span><kbd>Q</kbd>–<kbd>]</kbd> the minors</span>
			{:else}
				<span><kbd>1</kbd>–<kbd>=</kbd> majors round the circle</span>
				<span><kbd>Q</kbd>–<kbd>]</kbd> minors</span>
			{/if}
		</div>
	{/if}
	<!-- The progression pad, from @xl: a phone keeps to the circle (Kevin). -->
	{#if pad}
		<div class="hidden @xl-block">
			<ProgressionPad {account} bind:saved={savedProgressions} />
		</div>
	{/if}
	<!-- A phone: the 7 pad at the lower left, under a thumb, held for a seventh. -->
	<button
		class="@xl-hidden absolute left-3 bottom-3 w-14 h-14 rounded-full device-button-sm !min-w-0 text-18px font-600 touch-none {chordPlayer.seventhHeld
			? 'text-accent'
			: ''}"
		type="button"
		aria-pressed={chordPlayer.seventhHeld}
		title="Hold for a seventh on every chord"
		aria-label="Seventh"
		onpointerdown={seventhDown}
		onpointerup={seventhUp}
		onpointercancel={seventhUp}
		oncontextmenu={(e) => e.preventDefault()}>7</button
	>
	<div class="absolute right-5 bottom-3 text-11px tracking-wider text-dark font-600 select-none">
		SS FIFTHS 001
	</div>
</div>

{#snippet modeBlock()}
	<div class="flex gap-px" role="group" aria-label="Mode">
		<button
			class="device-button-sm px-3 rounded-r-none {chordPlayer.mode === 'chords'
				? 'text-accent'
				: ''}"
			type="button"
			aria-pressed={chordPlayer.mode === "chords"}
			onclick={() => chordPlayer.setMode("chords")}>Chords</button
		>
		<button
			class="device-button-sm px-3 rounded-l-none {chordPlayer.mode === 'notes'
				? 'text-accent'
				: ''}"
			type="button"
			aria-pressed={chordPlayer.mode === "notes"}
			onclick={() => chordPlayer.setMode("notes")}>Notes</button
		>
	</div>
{/snippet}

{#snippet keysBlock()}
	<div class="flex gap-px" role="group" aria-label="Labels">
		<button
			class="device-button-sm px-3 rounded-r-none {chordPlayer.showKeys ? 'text-accent' : ''}"
			type="button"
			aria-pressed={chordPlayer.showKeys}
			title={chordPlayer.showKeys
				? "Hide the computer keyboard's keys"
				: "Show the computer keyboard's keys on the circle"}
			aria-label="Keyboard labels"
			onclick={() => chordPlayer.setShowKeys(!chordPlayer.showKeys)}
		>
			<span class="i-ph-keyboard" aria-hidden="true"></span>
		</button>
		<button
			class="device-button-sm px-3 rounded-none font-serif tracking-wider {chordPlayer.showNumerals
				? 'text-accent'
				: ''}"
			type="button"
			aria-pressed={chordPlayer.showNumerals}
			title={chordPlayer.showNumerals
				? "Hide the chord numerals"
				: "Show each chord's Roman numeral in the key"}
			aria-label="Chord numerals"
			onclick={() => chordPlayer.setShowNumerals(!chordPlayer.showNumerals)}>IV</button
		>
		<button
			class="device-button-sm px-3 rounded-l-none {chordPlayer.layout === 'arch'
				? 'text-accent'
				: ''}"
			type="button"
			aria-pressed={chordPlayer.layout === "arch"}
			title={chordPlayer.layout === "arch"
				? "The whole circle"
				: "The arch: the key and its neighbours big across the top, the far keys small in the corners, the tritone left out"}
			aria-label="Arch layout"
			onclick={() => chordPlayer.setLayout(chordPlayer.layout === "arch" ? "circle" : "arch")}
		>
			<span class="i-ph-rainbow" aria-hidden="true"></span>
		</button>
	</div>
{/snippet}

{#snippet presetsBlock()}
	<div class="flex gap-1" role="group" aria-label="Presets">
		{#each SLOT_NUMBERS as n (n)}
			{@const p = slots[n - 1]}
			<button
				class="device-button-sm px-3 {activeSlot === n - 1 ? 'text-accent' : ''} {p
					? ''
					: 'opacity-50'}"
				type="button"
				aria-pressed={activeSlot === n - 1}
				disabled={!p}
				aria-label="Preset {n}{p ? `: ${p.name}` : ' (empty)'}"
				title={p ? p.name : `Empty preset ${n}`}
				onclick={() => p && loadPreset(p)}>{n}</button
			>
		{/each}
		<a
			class="device-button-sm px-2"
			href="/piano"
			title="Save and manage presets on the piano page"
			aria-label="Manage presets on the piano page"
		>
			<span class="i-ph-bookmarks-simple" aria-hidden="true"></span>
		</a>
	</div>
{/snippet}

{#snippet volumeBlock()}
	<input
		class="w-full accent-maximumYellow"
		type="range"
		min="0"
		max="100"
		value={Math.round(piano.volume * 100)}
		aria-label="Volume"
		oninput={(e) => piano.setVolume(Number(e.currentTarget.value) / 100)}
	/>
{/snippet}

{#snippet section(title: string, body: Snippet, open = false)}
	<details
		class="group border-t border-current/10 first-of-type-border-t-0"
		name="chord-player-compact-menu"
		{open}
	>
		<summary
			class="flex items-center justify-between gap-2 px-3 py-2 cursor-pointer select-none text-11px uppercase tracking-wider text-accent list-none [&::-webkit-details-marker]:hidden"
		>
			<span>{title}</span>
			<span
				class="i-ph-caret-down text-14px opacity-70 transition-transform group-open-rotate-180"
				aria-hidden="true"
			></span>
		</summary>
		<div class="pb-3 px-3">{@render body()}</div>
	</details>
{/snippet}

{#snippet compactMenuBlock()}
	<div class="grid grid-cols-1 -mt-3">
		{@render section("Play", modeBlock, true)}
		{@render section("View", keysBlock)}
		{@render section("Presets", presetsBlock)}
		{@render section("Volume", volumeBlock, true)}
		{@render section("Chords", chordsMenuBlock)}
		{@render section("Circle", circleMenuBlock)}
		{@render section("Effects", effectsMenuBlock)}
	</div>
{/snippet}

{#snippet chordsMenuBlock()}
	<div class="px-3 pt-3 pb-4 grid gap-4 [&_span.device-button-label]-(block mb-2 text-blue-100/90)">
		<label class="block">
			<span class="device-button-label">Style</span>
			<select
				class="device-field w-full"
				value={chordPlayer.style}
				onchange={(e) => chordPlayer.setStyle(e.currentTarget.value)}
			>
				{#each CHORD_STYLES as s (s.id)}<option value={s.id}>{s.label} · {s.hint}</option>{/each}
				{#if chordPlayer.customStyles.length}
					<optgroup label="{account?.name ?? 'Your'} styles">
						{#each chordPlayer.customStyles as s (s.id)}<option value="custom:{s.id}"
								>{s.name}</option
							>{/each}
					</optgroup>
				{/if}
			</select>
			<span class="block text-12px opacity-70 mt-1"
				>What the wedges carry by their place in the key. Blues puts a dominant seventh on every
				chord, jazz and lush the sevenths and extensions each degree takes; the 7 pad adds the next
				extension. Plain is triads with the pad's seventh.</span
			>
		</label>
		{#if account?.canEdit}
			{#if styleEditor}
				<ChordStyleEditor
					name={styleEditor.name}
					data={styleEditor.data}
					saving={styleSaving}
					onsave={saveStyle}
					oncancel={() => (styleEditor = null)}
				/>
			{:else}
				<div class="flex flex-wrap gap-2 -mt-2">
					<button
						class="device-button-sm px-3"
						type="button"
						title="A style of your own, starting from the one in use: choose what each degree carries"
						onclick={newStyle}>New style</button
					>
					{#if currentCustom}
						<button class="device-button-sm px-3" type="button" onclick={editStyle}>Edit</button>
						<button class="device-button-sm px-3" type="button" onclick={removeStyle}>Delete</button
						>
					{/if}
				</div>
			{/if}
		{/if}
		<label class="block">
			<span class="device-button-label">Voicing</span>
			<select
				class="device-field w-full"
				value={chordPlayer.voicing}
				onchange={(e) => chordPlayer.setVoicing(e.currentTarget.value as ChordVoicing)}
			>
				{#each VOICING_OPTIONS as v (v.value)}<option value={v.value}
						>{v.label} · {v.description}</option
					>{/each}
			</select>
		</label>
		<label class="block">
			<span class="device-button-label">The seventh on a major chord</span>
			<select
				class="device-field w-full"
				value={chordPlayer.seventhType}
				onchange={(e) => chordPlayer.setSeventhType(e.currentTarget.value as SeventhType)}
			>
				{#each SEVENTH_TYPES as t (t.id)}<option value={t.id}>{t.label}</option>{/each}
			</select>
			<span class="block text-12px opacity-70 mt-1"
				>A minor chord always takes the minor seventh. Hold the 7 pad or Shift for a seventh; a
				second finger on a sounding wedge adds it too.</span
			>
		</label>
		<label class="block">
			<span class="device-button-label">Strum</span>
			<select
				class="device-field w-full"
				value={chordPlayer.strum}
				onchange={(e) => chordPlayer.setStrum(e.currentTarget.value as Strum)}
			>
				{#each STRUMS as s (s.id)}<option value={s.id}>{s.label}</option>{/each}
			</select>
			<span class="block text-12px opacity-70 mt-1"
				>The notes of a chord a few milliseconds apart, low to high, as a hand plays them.</span
			>
		</label>
		<label class="block">
			<span class="device-button-label">Velocity · {Math.round(chordPlayer.velocity * 100)}%</span>
			<input
				class="w-full accent-maximumYellow"
				type="range"
				min="20"
				max="100"
				value={Math.round(chordPlayer.velocity * 100)}
				aria-label="Velocity in percent"
				oninput={(e) => chordPlayer.setVelocity(Number(e.currentTarget.value) / 100)}
			/>
		</label>
		<label class="block">
			<span class="device-button-label">Octave · {chordPlayer.octave}</span>
			<input
				class="w-full accent-maximumYellow"
				type="range"
				min="2"
				max="6"
				step="1"
				value={chordPlayer.octave}
				aria-label="Octave"
				oninput={(e) => chordPlayer.setOctave(Number(e.currentTarget.value))}
			/>
			<span class="block text-12px opacity-70 mt-1"
				>The chord root's octave, and the notes' in notes mode; 4 is middle C's.</span
			>
		</label>
	</div>
{/snippet}

{#snippet circleMenuBlock()}
	<div class="px-3 pt-3 pb-4 grid gap-4 [&_span.device-button-label]-(block mb-2 text-blue-100/90)">
		<label class="block">
			<span class="device-button-label">Key center</span>
			<select
				class="device-field w-full"
				value={String(chordPlayer.keyCenter)}
				onchange={(e) => chordPlayer.setKeyCenter(Number(e.currentTarget.value))}
			>
				{#each KEY_OPTIONS as k (k.value)}<option value={k.value}>{k.label}</option>{/each}
			</select>
			<span class="block text-12px opacity-70 mt-1"
				>The circle turns so this key's chord sits at the bottom (or the top), its neighbours the
				chords that fit it best.</span
			>
		</label>
		<label class="block">
			<span class="device-button-label">Computer keyboard</span>
			<select
				class="device-field w-full"
				value={chordPlayer.keyMap}
				onchange={(e) => chordPlayer.setKeyMap(e.currentTarget.value as ChordKeyMap)}
			>
				<option value="circle">Round the circle · 1 is the key, then clockwise in fifths</option>
				<option value="degree">By degree · 1 to 7 are I to VII, 8 to = the chromatic chords</option>
			</select>
			<span class="block text-12px opacity-70 mt-1"
				>The number row plays the majors, the row below the minors on the same roots. By degree,
				I–IV–V is 1, 4, 5.</span
			>
		</label>
		<label class="flex items-center gap-2 text-13px text-blue-100/90">
			<input
				type="checkbox"
				class="accent-maximumYellow"
				checked={chordPlayer.keyAtTop}
				onchange={(e) => chordPlayer.setKeyAtTop(e.currentTarget.checked)}
			/>
			The key at the top (off: at the bottom, and the arch a bowl for a thumb)
		</label>
		<label class="flex items-center gap-2 text-13px text-blue-100/90">
			<input
				type="checkbox"
				class="accent-maximumYellow"
				checked={chordPlayer.showSignatures}
				onchange={(e) => chordPlayer.setShowSignatures(e.currentTarget.checked)}
			/>
			Show the key signatures
		</label>
		<label class="flex items-center gap-2 text-13px text-blue-100/90">
			<input
				type="checkbox"
				class="accent-maximumYellow"
				checked={chordPlayer.highlightKey}
				onchange={(e) => chordPlayer.setHighlightKey(e.currentTarget.checked)}
			/>
			Dim the chords outside the key
		</label>
	</div>
{/snippet}

{#snippet timingMenuBlock()}
	<div class="px-3 pt-3 pb-4 grid gap-4 [&_span.device-button-label]-(block mb-2 text-blue-100/90)">
		<div>
			<span class="device-button-label">Tempo · {metronome.bpm} bpm</span>
			<div class="flex items-center gap-1 mb-2">
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
			<span class="block text-12px opacity-70 mt-1"
				>The pad measures a held chord against this tempo: about a beat, two or four.</span
			>
		</div>
		<label class="block">
			<span class="device-button-label">Beats to the bar</span>
			<select
				class="device-field w-full"
				value={String(metronome.beatsPerBar)}
				onchange={(e) => metronome.setBeats(Number(e.currentTarget.value))}
			>
				{#each BEATS_PER_BAR as n (n)}<option value={String(n)}>{n}</option>{/each}
			</select>
		</label>
		<div class="grid gap-2">
			<button
				class="device-button-sm px-3 justify-self-start {metronome.running ? 'text-accent' : ''}"
				type="button"
				aria-pressed={metronome.running}
				title={metronome.running ? "Stop the click" : "A click to play along to, at this tempo"}
				onclick={() => metronome.toggle()}
			>
				<span class="i-ph-metronome" aria-hidden="true"></span>
				{metronome.running ? "Click on" : "Click"}
			</button>
			<label class="flex items-center gap-2 text-13px text-blue-100/90">
				<input
					type="checkbox"
					class="accent-maximumYellow"
					checked={progressionPad.click}
					onchange={(e) => progressionPad.setClick(e.currentTarget.checked)}
				/>
				A click under the pad's playback
			</label>
		</div>
	</div>
{/snippet}

{#snippet effectsMenuBlock()}
	<PianoEffectsMenu />
{/snippet}
