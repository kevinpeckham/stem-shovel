<script lang="ts">
	import { onDestroy, type Snippet } from "svelte";
	import {
		ARP_PATTERNS,
		ARP_RATES,
		chordPlayer,
		type ArpPattern,
		type ArpRate,
		type ChordAccent,
		type NoteReadout,
		type StrumDirection,
	} from "$lib/audio/chordPlayer.svelte";
	import { metronome } from "$lib/audio/metronome.svelte";
	import { progressionPad } from "$lib/audio/progression.svelte";
	import { piano } from "$lib/audio/piano.svelte";
	import CircleOfFifths from "$lib/components/CircleOfFifths.svelte";
	import ComboBox from "$lib/components/ComboBox.svelte";
	import ContextMenu from "$lib/components/ContextMenu.svelte";
	import PianoEffectsMenu from "$lib/components/PianoEffectsMenu.svelte";
	import ChordPresets from "$lib/components/ChordPresets.svelte";
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
	 * Presets and Volume beside its own Chords and UI menus. Presets
	 * here load; saving and managing them is the piano page's.
	 */
	interface SavedPreset {
		id: string;
		name: string;
		slot: number | null;
		chordSlot?: number | null;
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
		/** A system admin: the site's default buttons are theirs to set. */
		presetAdmin?: boolean;
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
		presetAdmin = false,
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
	/** The styles' short hints for the device's dropdown (the Chords menu carries the full ones). */
	const STYLE_SHORT: Record<string, string> = {
		plain: "triads",
		blues: "7ths everywhere",
		jazz: "7ths by degree",
		lush: "9ths and 13ths",
		folk: "open shapes",
		fifths: "power chords",
		minor: "the relative minor as home",
		honkytonk: "sixths and sevenths",
		ragtime: "dominant chains",
		bossa: "soft jazz colours",
	};
	/** The built-in styles and the account's own, for the device's Style dropdown. */
	const STYLE_OPTIONS = $derived([
		...CHORD_STYLES.map((s) => ({ value: s.id, label: s.label, description: STYLE_SHORT[s.id] })),
		...chordPlayer.customStyles.map((s) => ({
			value: `custom:${s.id}`,
			label: s.name,
			description: account ? `${account.name}'s style` : "a saved style",
		})),
	]);

	// ---- presets: the piano's, loaded here (docs/piano.md, "Presets") ----
	// svelte-ignore state_referenced_locally
	let site = $state<(NamedPianoPreset | null)[]>(sitePresets ?? []);
	// svelte-ignore state_referenced_locally
	let saved = $state<SavedPreset[]>(presets);
	let overrides = $state<Record<number, NamedPianoPreset>>({});
	if (typeof window !== "undefined") overrides = loadPianoSlotOverrides("chords");
	let loaded = $state<NamedPianoPreset | null>(null);
	const slots = $derived(resolvePianoSlots(site, overrides, account ? saved : null, "chords"));
	/** What a preset saved here holds: the piano's sound and effects, and the chord player's own settings. */
	const currentPreset = (): PianoPresetData => ({
		...piano.currentPreset(),
		chords: $state.snapshot(chordPlayer.presetSettings),
	});
	const currentKey = $derived(pianoPresetKey(piano.currentPreset()));
	const currentChords = $derived(chordPlayer.presetSettings);
	/** A preset matches the sound playing when its piano part does and, if it carries chord settings, those too, field by field (a preset saved before a setting existed has nothing to say about it). */
	const matches = (data: PianoPresetData) =>
		pianoPresetKey({ ...data, chords: undefined }) === currentKey &&
		(!data.chords ||
			(Object.entries(data.chords) as [keyof typeof currentChords, unknown][]).every(
				([k, v]) => JSON.stringify(currentChords[k]) === JSON.stringify(v),
			));
	const activeSlot = $derived(slots.findIndex((p) => p && matches(p.data)));
	const presetLine = $derived.by(() => {
		const slot = activeSlot >= 0 ? slots[activeSlot] : null;
		if (slot) return { name: slot.name, edited: false };
		if (loaded) return { name: loaded.name, edited: !matches(loaded.data) };
		return null;
	});
	function loadPreset(preset: NamedPianoPreset) {
		chordPlayer.allOff();
		piano.applyPreset(preset.data);
		if (preset.data.chords) chordPlayer.applyPresetSettings(preset.data.chords);
		loaded = { name: preset.name, data: preset.data };
	}

	// ---- the wedges ----
	const pressed = $derived(new Set(chordPlayer.sounding.map((s) => s.wedge)));
	/** Learn mode's next chord, outlined on the circle and named in the readout while nothing sounds. */
	const learnTarget = $derived(pad ? progressionPad.learnTarget : null);
	const centre = $derived(
		chordPlayer.sounding.map((s) => s.name).join(" + ") ||
			(learnTarget ? `Next: ${learnTarget.label}` : ""),
	);
	const keyLabel = $derived(CIRCLE_OF_FIFTHS[chordPlayer.keyCenter].major.label);
	function press(index: number, quality: ChordQuality, pointerId: number) {
		chordPlayer.press(index, quality, `pointer:${pointerId}`);
	}
	function release(pointerId: number) {
		chordPlayer.release(`pointer:${pointerId}`);
	}
	function invert(index: number, quality: ChordQuality, pointerId: number, inversion: number) {
		chordPlayer.invert(index, quality, `pointer:${pointerId}`, inversion);
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
	/** The sustain pad: the pedal down while it is held, for a tablet with no space bar (Kevin). */
	function sustainDown(e: PointerEvent) {
		e.preventDefault();
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		piano.setSustain(true);
	}
	function sustainUp() {
		piano.setSustain(false);
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
		// The arrow keys turn the key a fifth either way, as the Key buttons do (Kevin).
		if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
			e.preventDefault();
			if (!e.repeat)
				chordPlayer.setKeyCenter(chordPlayer.keyCenter + (e.code === "ArrowRight" ? 1 : -1));
			return;
		}
		if (e.code === "ArrowUp" || e.code === "ArrowDown") {
			e.preventDefault();
			if (!e.repeat) chordPlayer.setOctave(chordPlayer.octave + (e.code === "ArrowUp" ? 1 : -1));
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

<!-- select-none on the whole device: on a phone a held pad was selecting its text instead of pressing (Kevin's testers), and the callout likewise. -->
<div
	class="@container device-chrome grid gap-3 px-3 py-4 pb-20 @xl-pb-10 @xl-px-5 @xl-pt-5 w-full max-w-full relative select-none [-webkit-touch-callout:none]"
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
					{#if chordPlayer.arp}<span class="text-accent">· arp</span>{/if}
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
				popoverClasses="text-13px"
				buttonClasses="device-button-sm px-3 w-full"
				options={INSTRUMENT_OPTIONS}
				value={piano.instrument}
				onchange={(v) => {
					chordPlayer.allOff();
					piano.setInstrument(v as PianoInstrumentId);
				}}
			/>
		</div>
		<div class="hidden @xl-block min-w-28">
			<div class="device-button-group-label text-dark hidden @xl-block">Style</div>
			<ComboBox
				ariaLabel="Style"
				clearDefaultButtonClasses={true}
				popoverClasses="text-13px !w-max !min-w-full max-w-lg"
				buttonClasses="device-button-sm px-3 w-full"
				options={STYLE_OPTIONS}
				value={chordPlayer.style}
				onchange={(v) => chordPlayer.setStyle(v)}
			/>
		</div>
		<div class="hidden @xl-block min-w-32">
			<div class="device-button-group-label text-dark hidden @xl-block">Voicing</div>
			<ComboBox
				ariaLabel="Voicing"
				clearDefaultButtonClasses={true}
				popoverClasses="text-13px !w-max !min-w-full max-w-lg"
				buttonClasses="device-button-sm px-3 w-full"
				options={VOICING_OPTIONS}
				value={chordPlayer.voicing}
				onchange={(v) => chordPlayer.setVoicing(v as ChordVoicing)}
			/>
		</div>
		<div class="hidden @xl-block">
			<div class="device-button-group-label text-dark hidden @xl-block">Play</div>
			{@render modeBlock()}
		</div>
		<div class="hidden @xl-block">
			<div class="device-button-group-label text-dark hidden @xl-block">Arpeggio</div>
			<!-- A split button (Kevin): Arp toggles the arpeggiator; the caret opens its settings. -->
			<div class="flex gap-px" role="group" aria-label="Arpeggiator">
				{@render arpButton("rounded-r-none")}
				<ContextMenu
					ariaLabel="Arpeggiator settings"
					title="Rate, pattern, octaves, gate and latch"
					iconClass="i-ph-caret-down"
					position="bottom right"
					buttonBaseClasses="device-button-sm px-2 !min-w-0 rounded-l-none"
					popoverClasses="min-w-72 @xl-min-w-96 max-w-lg !max-h-[calc(100%-0.5rem)] overflow-y-auto"
					items={[
						{ id: "arp-heading", kind: "heading", label: "Arpeggiator" },
						{ id: "arp-block", kind: "snippet", snippet: arpMenuBlock },
					]}
				/>
			</div>
		</div>
		<div class="hidden @xl-block">
			<div class="device-button-group-label text-dark hidden @xl-block">Strum</div>
			<!-- A split button (Kevin): Strum switches the strum on at its last speed or off; the caret opens its speed and direction. -->
			<div class="flex gap-px" role="group" aria-label="Strum">
				{@render strumButton("rounded-r-none")}
				<ContextMenu
					ariaLabel="Strum settings"
					title="Speed and direction"
					iconClass="i-ph-caret-down"
					position="bottom right"
					buttonBaseClasses="device-button-sm px-2 !min-w-0 rounded-l-none"
					popoverClasses="min-w-72 @xl-min-w-96 max-w-lg !max-h-[calc(100%-0.5rem)] overflow-y-auto"
					items={[
						{ id: "strum-heading", kind: "heading", label: "Strum" },
						{ id: "strum-block", kind: "snippet", snippet: strumMenuBlock },
					]}
				/>
			</div>
		</div>
		<div class="@xl-hidden">
			<ComboBox
				ariaLabel="Key center"
				clearDefaultButtonClasses={true}
				popoverClasses="text-13px"
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
			<div class="device-button-group-label text-dark hidden @xl-block">Guides</div>
			{@render keysBlock()}
		</div>
		<div class="hidden @xl-block">
			<div class="device-button-group-label text-dark hidden @xl-block">Presets</div>
			{@render presetsBlock()}
		</div>
		<div class="hidden @xl-block">
			<div class="device-button-group-label text-dark hidden @xl-block">Metronome</div>
			<!-- A split button (Kevin): the tempo starts and stops the click; the caret beside it opens the Timing menu. -->
			<div class="flex gap-px" role="group" aria-label="Timing">
				<button
					class="device-button-sm px-3 rounded-r-none tabular-nums {metronome.running
						? 'text-accent'
						: ''}"
					type="button"
					aria-pressed={metronome.running}
					title={metronome.running ? "Stop the click" : "A click to play along to, at this tempo"}
					aria-label="Click at {metronome.bpm} bpm"
					onclick={() => metronome.toggle()}
				>
					<span class="i-ph-metronome" aria-hidden="true"></span>
					{metronome.bpm} bpm
				</button>
				<ContextMenu
					ariaLabel="Timing"
					title="Tempo, tap, beats to the bar and the click"
					iconClass="i-ph-caret-down"
					position="bottom right"
					buttonBaseClasses="device-button-sm px-2 !min-w-0 rounded-l-none"
					popoverClasses="min-w-72 @xl-min-w-96 max-w-lg !max-h-[calc(100%-0.5rem)] overflow-y-auto"
					items={[
						{ id: "timing-heading", kind: "heading", label: "Timing" },
						{ id: "timing-block", kind: "snippet", snippet: timingMenuBlock },
					]}
				/>
			</div>
		</div>
		<div class="hidden @xl-block">
			<div class="device-button-group-label text-dark hidden @xl-block">Settings</div>
			<div class="flex flex-wrap gap-2">
				<ContextMenu
					ariaLabel="Chords settings"
					title="Voicing, the seventh, accent, velocity and octave"
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
					ariaLabel="UI settings"
					title="The layout, where the key sits, the signatures, the dim outside the key, the keyboard map"
					iconClass="i-ph-layout"
					label="UI"
					position="bottom right"
					buttonBaseClasses="device-button-sm px-3"
					popoverClasses="min-w-72 @xl-min-w-96 max-w-lg !max-h-[calc(100%-0.5rem)] overflow-y-auto"
					items={[
						{ id: "ui-heading", kind: "heading", label: "UI" },
						{ id: "ui-block", kind: "snippet", snippet: circleMenuBlock },
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
		class="relative -mx-3 overflow-hidden @xl-mx-auto @xl-overflow-visible w-[calc(100%+1.5rem)] @xl-w-full {chordPlayer.layout ===
		'arch'
			? '@xl-max-w-700px'
			: '@xl-max-w-560px'} text-blue-100"
	>
		<!-- From @xl the 7 pad and the sustain pad are round pads in the box's empty corners (the arch's top corners; the bowl's bottom ones), under a hand either side (Kevin). -->
		{@render cornerPad(
			"left-0",
			chordPlayer.seventhHeld,
			"Seventh",
			"Hold for a seventh on every chord (or hold Shift)",
			seventhDown,
			seventhUp,
			seventh,
		)}
		{@render cornerPad(
			"right-0",
			piano.sustain,
			"Sustain",
			"Hold for the sustain pedal (or hold the space bar)",
			sustainDown,
			sustainUp,
			sustain,
		)}
		<!-- The octave, a small button above each pad at the device's edge (Kevin): down on the left, up on the right; the arrow keys do the same. -->
		{@render octaveButton("left-0", -1)}
		{@render octaveButton("right-0", 1)}
		<CircleOfFifths
			class={chordPlayer.layout === "arch" ? "w-full" : "w-[114%] -ml-[7%] @xl-w-full @xl-ml-0"}
			positions={chordPlayer.positions}
			notes={chordPlayer.notes}
			labels={chordPlayer.wedgeLabels}
			mode={chordPlayer.mode}
			layout={chordPlayer.drawnLayout}
			showSignatures={chordPlayer.showSignatures}
			showKeys={chordPlayer.showKeys}
			keyLabels={chordPlayer.keyLabels}
			keyIndex={chordPlayer.keyIndex}
			showNumerals={chordPlayer.showNumerals}
			highlightKey={chordPlayer.highlightKey}
			{pressed}
			target={learnTarget?.wedge ?? null}
			{centre}
			readoutNotes={chordPlayer.soundingSpelled}
			noteReadout={chordPlayer.noteReadout}
			onpress={press}
			onrelease={release}
			oninvert={invert}
		/>
	</div>
	<!-- The keyboard's shortcuts under the circle: Space, Shift and Esc always from @xl (Kevin), the rows with the key labels. -->
	{#if keyboard}
		<div
			class="{chordPlayer.showKeys
				? 'flex'
				: 'hidden @xl-flex'} flex-wrap justify-center gap-x-4 gap-y-1 text-12px text-dark [&_kbd]-(inline-block rounded border border-current/40 px-1.5 py-px font-mono text-11px leading-tight)"
			aria-label="Keyboard shortcuts"
		>
			<span><kbd>Space</kbd> sustain</span>
			<span><kbd>Shift</kbd> seventh</span>
			<span><kbd>Esc</kbd> all off</span>
			<span><kbd>←</kbd><kbd>→</kbd> key</span>
			<span><kbd>↑</kbd><kbd>↓</kbd> octave</span>
			{#if !chordPlayer.showKeys}
				<!-- the rows come with the key labels -->
			{:else if chordPlayer.keyMap === "degree"}
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
	<!-- A phone: the sustain pad and the 7 pad at the lower left, under a thumb, each held. -->
	<button
		class="@xl-hidden absolute left-3 bottom-3 w-14 h-14 rounded-full device-button-sm !min-w-0 text-18px touch-none {piano.sustain
			? 'text-accent'
			: ''}"
		type="button"
		aria-pressed={piano.sustain}
		title="Hold for the sustain pedal"
		aria-label="Sustain"
		onpointerdown={sustainDown}
		onpointerup={sustainUp}
		onpointercancel={sustainUp}
		oncontextmenu={(e) => e.preventDefault()}
	>
		<span class="i-ph-waves" aria-hidden="true"></span>
	</button>
	<button
		class="@xl-hidden absolute left-19 bottom-3 w-14 h-14 rounded-full device-button-sm !min-w-0 text-18px font-600 touch-none {chordPlayer.seventhHeld
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
	<!-- A phone: the five presets as small round buttons above the brand (Kevin), the full rack being in the wrench menu. -->
	<div
		class="@xl-hidden absolute right-4 bottom-9 flex gap-1.5"
		role="group"
		aria-label="Presets (quick)"
	>
		{#each slots as p, i (i)}
			<button
				class="w-7 h-7 rounded-full device-button-sm !min-w-0 !px-0 text-11px tabular-nums {activeSlot ===
				i
					? 'text-accent'
					: ''} {p ? '' : 'opacity-40'}"
				type="button"
				aria-pressed={activeSlot === i}
				disabled={!p}
				aria-label="Preset {i + 1}{p ? `: ${p.name}` : ' (empty)'}"
				title={p ? p.name : `Empty preset ${i + 1}`}
				onclick={() => p && loadPreset(p)}>{i + 1}</button
			>
		{/each}
	</div>
	<div class="absolute right-5 bottom-3 text-11px tracking-wider text-dark font-600 select-none">
		SS FIFTHS 001
	</div>
</div>

{#snippet seventh()}
	<span class="text-26px font-600 leading-none">7</span>
	<span class="text-10px uppercase tracking-wider opacity-70">seventh</span>
{/snippet}
{#snippet sustain()}
	<span class="i-ph-waves text-24px" aria-hidden="true"></span>
	<span class="text-10px uppercase tracking-wider opacity-70">sustain</span>
{/snippet}
{#snippet octaveButton(side: string, step: -1 | 1)}
	<button
		class="hidden @xl-flex absolute {side} {chordPlayer.drawnLayout === 'arch-down'
			? 'bottom-26'
			: 'top-26'} z-10 w-9 h-9 rounded-full device-button-sm !min-w-0 !px-0 items-center justify-center text-14px"
		type="button"
		aria-label={step > 0 ? "Octave up" : "Octave down"}
		title="{step > 0 ? 'Octave up' : 'Octave down'} · now {chordPlayer.octave} (the arrow keys too)"
		disabled={step > 0 ? chordPlayer.octave >= 6 : chordPlayer.octave <= 2}
		onclick={() => chordPlayer.setOctave(chordPlayer.octave + step)}
	>
		<span class={step > 0 ? "i-ph-plus" : "i-ph-minus"} aria-hidden="true"></span>
	</button>
{/snippet}

{#snippet cornerPad(
	side: string,
	on: boolean,
	label: string,
	title: string,
	down: (e: PointerEvent) => void,
	up: () => void,
	face: Snippet,
)}
	<button
		class="hidden @xl-flex absolute {side} {chordPlayer.drawnLayout === 'arch-down'
			? 'bottom-2'
			: 'top-2'} z-10 w-22 h-22 rounded-full device-button-sm !min-w-0 flex-col items-center justify-center gap-0.5 touch-none {on
			? 'text-accent'
			: ''}"
		type="button"
		aria-pressed={on}
		{title}
		aria-label={label}
		onpointerdown={down}
		onpointerup={up}
		onpointercancel={up}
		oncontextmenu={(e) => e.preventDefault()}
	>
		{@render face()}
	</button>
{/snippet}

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

{#snippet arpButton(classes: string)}
	<button
		class="device-button-sm px-3 {classes} {chordPlayer.arp ? 'text-accent' : ''}"
		type="button"
		aria-pressed={chordPlayer.arp}
		title={chordPlayer.arp
			? "Arpeggiator on: a held wedge plays its notes one at a time; click to play them together"
			: "Arpeggiator: a held wedge plays its notes one at a time in time with the tempo"}
		aria-label="Arpeggiator"
		onclick={() => chordPlayer.setArp(!chordPlayer.arp)}
	>
		<span class="i-ph-wave-sawtooth" aria-hidden="true"></span>
		Arp
	</button>
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
			class="device-button-sm px-3 rounded-l-none font-serif tracking-wider {chordPlayer.showNumerals
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
	</div>
{/snippet}

{#snippet presetsBlock()}
	<ChordPresets
		{account}
		{presetAdmin}
		{slots}
		{activeSlot}
		bind:saved
		bind:site
		bind:overrides
		current={currentPreset}
		onload={loadPreset}
	/>
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
		{@render section("Arpeggiator", arpSection)}
		{@render section("Strum", strumSection)}
		{@render section("Guides", keysBlock)}
		{@render section("Presets", presetsBlock)}
		{@render section("Volume", volumeBlock, true)}
		{@render section("Chords", chordsMenuBlock)}
		{@render section("UI", circleMenuBlock)}
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
			<span class="device-button-label">Accent</span>
			<select
				class="device-field w-full"
				value={chordPlayer.accent}
				onchange={(e) => chordPlayer.setAccent(e.currentTarget.value as ChordAccent)}
			>
				<option value="none">Even · every note alike</option>
				<option value="top">Top note · the melody note louder</option>
				<option value="bottom">Bottom note · the bass louder</option>
			</select>
			<span class="block text-12px opacity-70 mt-1"
				>Drag up within a wedge while you hold it to turn the chord over (C/E, then C/G); drag back
				down to turn it back.</span
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

{#snippet strumButton(classes: string)}
	<button
		class="device-button-sm px-3 {classes} {chordPlayer.strum !== 'off' ? 'text-accent' : ''}"
		type="button"
		aria-pressed={chordPlayer.strum !== "off"}
		title={chordPlayer.strum !== "off"
			? "Strum on: the notes of a chord a few milliseconds apart; click to play them together"
			: "Strum: the notes of a chord a few milliseconds apart, as a hand plays them"}
		aria-label="Strum"
		onclick={() => chordPlayer.toggleStrum()}
	>
		<span class="i-ph-hand-waving" aria-hidden="true"></span>
		Strum
	</button>
{/snippet}

{#snippet strumSection()}
	<div class="grid gap-3">
		{@render strumButton("justify-self-start")}
		{@render strumMenuBlock()}
	</div>
{/snippet}

{#snippet strumMenuBlock()}
	<div class="px-3 pt-3 pb-4 grid gap-4 [&_span.device-button-label]-(block mb-2 text-blue-100/90)">
		<label class="block">
			<span class="device-button-label">Speed</span>
			<select
				class="device-field w-full"
				value={chordPlayer.strum}
				onchange={(e) => chordPlayer.setStrum(e.currentTarget.value as Strum)}
			>
				{#each STRUMS as s (s.id)}<option value={s.id}>{s.label}</option>{/each}
			</select>
			<span class="block text-12px opacity-70 mt-1"
				>The notes of a chord a few milliseconds apart, as a hand plays them; Off plays them
				together.</span
			>
		</label>
		<label class="block">
			<span class="device-button-label">Direction</span>
			<select
				class="device-field w-full"
				value={chordPlayer.strumDirection}
				onchange={(e) => chordPlayer.setStrumDirection(e.currentTarget.value as StrumDirection)}
			>
				<option value="down">Down · low to high</option>
				<option value="up">Up · high to low</option>
				<option value="alternate">Alternate · down, then up, press by press</option>
			</select>
		</label>
	</div>
{/snippet}

{#snippet arpSection()}
	<div class="grid gap-3">
		{@render arpButton("justify-self-start")}
		{@render arpMenuBlock()}
	</div>
{/snippet}

{#snippet arpMenuBlock()}
	<div class="px-3 pt-3 pb-4 grid gap-4 [&_span.device-button-label]-(block mb-2 text-blue-100/90)">
		<p class="text-12px opacity-70 -mt-1">
			A held wedge plays its notes one at a time, at the Timing tempo. Styles and voicings decide
			which notes; a new chord restarts the pattern as you press it.
		</p>
		<div class="grid gap-4">
			<label class="block">
				<span class="device-button-label">Rate</span>
				<select
					class="device-field w-full"
					value={chordPlayer.arpRate}
					onchange={(e) => chordPlayer.setArpRate(e.currentTarget.value as ArpRate)}
				>
					{#each ARP_RATES as r (r.id)}<option value={r.id}>{r.label}</option>{/each}
				</select>
			</label>
			<label class="block">
				<span class="device-button-label">Pattern</span>
				<select
					class="device-field w-full"
					value={chordPlayer.arpPattern}
					onchange={(e) => chordPlayer.setArpPattern(e.currentTarget.value as ArpPattern)}
				>
					{#each ARP_PATTERNS as r (r.id)}<option value={r.id}>{r.label}</option>{/each}
				</select>
			</label>
			<label class="block">
				<span class="device-button-label">Octaves · {chordPlayer.arpOctaves}</span>
				<input
					class="w-full accent-maximumYellow"
					type="range"
					min="1"
					max="3"
					step="1"
					value={chordPlayer.arpOctaves}
					aria-label="Arpeggiator octaves"
					oninput={(e) => chordPlayer.setArpOctaves(Number(e.currentTarget.value))}
				/>
				<span class="block text-12px opacity-70 mt-1"
					>The pattern climbs through this many octaves before it repeats.</span
				>
			</label>
			<label class="block">
				<span class="device-button-label">Gate · {Math.round(chordPlayer.arpGate * 100)}%</span>
				<input
					class="w-full accent-maximumYellow"
					type="range"
					min="10"
					max="100"
					step="5"
					value={Math.round(chordPlayer.arpGate * 100)}
					aria-label="Arpeggiator gate in percent"
					oninput={(e) => chordPlayer.setArpGate(Number(e.currentTarget.value) / 100)}
				/>
				<span class="block text-12px opacity-70 mt-1"
					>How much of each step the note sounds: short and clipped, or running into the next.</span
				>
			</label>
			<label class="flex items-center gap-2 text-13px text-blue-100/90">
				<input
					type="checkbox"
					class="accent-maximumYellow"
					checked={chordPlayer.arpLatch}
					onchange={(e) => chordPlayer.setArpLatch(e.currentTarget.checked)}
				/>
				Latch: the pattern keeps going after you let go, until the next chord or Esc
			</label>
		</div>
	</div>
{/snippet}

{#snippet circleMenuBlock()}
	<div class="px-3 pt-3 pb-4 grid gap-4 [&_span.device-button-label]-(block mb-2 text-blue-100/90)">
		<label class="block">
			<span class="device-button-label">Layout</span>
			<select
				class="device-field w-full"
				value={chordPlayer.layout}
				onchange={(e) => chordPlayer.setLayout(e.currentTarget.value as "circle" | "arch")}
			>
				<option value="circle">The circle · all twelve keys round</option>
				<option value="arch"
					>The arch · the key and its neighbours big, the far keys small, no tritone</option
				>
			</select>
			<span class="block text-12px opacity-70 mt-1"
				>The arch turns over into a bowl, for a thumb on a phone, when the key is at the bottom.</span
			>
		</label>
		<label class="block">
			<span class="device-button-label">Where the key sits</span>
			<select
				class="device-field w-full"
				value={chordPlayer.keyAtTop ? "top" : "bottom"}
				onchange={(e) => chordPlayer.setKeyAtTop(e.currentTarget.value === "top")}
			>
				<option value="bottom">At the bottom · the I chord under your thumb, the arch a bowl</option
				>
				<option value="top">At the top · the I chord at twelve o'clock</option>
			</select>
		</label>
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
			<span class="device-button-label">Notes in the readout</span>
			<select
				class="device-field w-full"
				value={chordPlayer.noteReadout}
				onchange={(e) => chordPlayer.setNoteReadout(e.currentTarget.value as NoteReadout)}
			>
				<option value="names">Written · C E G B♭ under the chord name</option>
				<option value="staff">On a staff · the notes on a treble staff</option>
				<option value="both">Both · the staff, then the names written under it</option>
				<option value="off">Off · the chord name alone</option>
			</select>
		</label>
		<label class="block">
			<span class="device-button-label">Computer keyboard</span>
			<select
				class="device-field w-full"
				value={chordPlayer.keyMap}
				onchange={(e) => chordPlayer.setKeyMap(e.currentTarget.value as ChordKeyMap)}
			>
				<option value="degree">By degree · 1 to 7 are I to VII, 8 to = the chromatic chords</option>
				<option value="circle">Round the circle · 1 is the key, then clockwise in fifths</option>
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
