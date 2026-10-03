<script lang="ts">
	import { onDestroy } from "svelte";
	import { chordPlayer } from "$lib/audio/chordPlayer.svelte";
	import { piano } from "$lib/audio/piano.svelte";
	import CircleOfFifths from "$lib/components/CircleOfFifths.svelte";
	import ComboBox from "$lib/components/ComboBox.svelte";
	import ContextMenu from "$lib/components/ContextMenu.svelte";
	import PianoEffectsMenu from "$lib/components/PianoEffectsMenu.svelte";
	import {
		CHORD_KEY_CODES,
		CHORD_VOICINGS,
		CIRCLE_OF_FIFTHS,
		KEY_CENTERS,
		SEVENTH_TYPES,
		STRUMS,
		type ChordQuality,
		type ChordVoicing,
		type SeventhType,
		type Strum,
	} from "$lib/constants/circleOfFifths";
	import { PIANO_INSTRUMENTS, type PianoInstrumentId } from "$lib/constants/piano";
	import { PIANO_PRESET_SLOTS } from "$lib/val/PianoPresetSchema";
	import { isTextEntry } from "$lib/utils/isTextEntry";
	import { loadPianoSlotOverrides } from "$lib/utils/pianoSlotOverrides";
	import { pianoPresetKey } from "$lib/utils/pianoPresetKey";
	import { resolvePianoSlots } from "$lib/utils/resolvePianoSlots";
	import type { NamedPianoPreset, PianoPresetData } from "$lib/val/PianoPresetSchema";

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
	}
	let {
		keyboard = true,
		warm = false,
		samplesBase = null,
		sitePresets = null,
		account = null,
		presets = [],
	}: Props = $props();

	// The engines, from the page's first render (they are shared singletons; `load` is idempotent).
	piano.samplesBase = samplesBase;
	piano.load(warm);
	chordPlayer.load();

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
		const key = CHORD_KEY_CODES[e.code];
		if (!key || e.repeat || downCodes.has(e.code)) return;
		e.preventDefault();
		downCodes.add(e.code);
		chordPlayer.press(key.position, key.quality, `key:${e.code}`);
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
		if (typeof window !== "undefined") chordPlayer.allOff();
	});
</script>

<svelte:window {onkeydown} {onkeyup} {onblur} />

<div
	class="@container device-chrome grid gap-3 px-3 py-4 pb-10 @xl-px-5 @xl-pt-5 w-full max-w-full relative"
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

	<!-- the controls above the circle -->
	<div class="flex flex-wrap items-end gap-x-4 gap-y-3">
		<div>
			<div class="device-button-group-label text-dark">Power</div>
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
		<div class="min-w-36">
			<div class="device-button-group-label text-dark">Sound</div>
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
		<div>
			<div class="device-button-group-label text-dark">Play</div>
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
		</div>
		<div>
			<div class="device-button-group-label text-dark">Key</div>
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
		<div>
			<div class="device-button-group-label text-dark">Seventh</div>
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
		<div>
			<div class="device-button-group-label text-dark">Presets</div>
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
		</div>
		<div>
			<div class="device-button-group-label text-dark">Settings</div>
			<div class="flex flex-wrap gap-2">
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
					title="The key at the top, where it sits, the signatures"
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
		<div class="@xl-ml-auto min-w-120px grow @xl-grow-0 @xl-w-40">
			<div class="device-button-group-label text-dark">Volume</div>
			<input
				class="w-full accent-maximumYellow"
				type="range"
				min="0"
				max="100"
				value={Math.round(piano.volume * 100)}
				aria-label="Volume"
				oninput={(e) => piano.setVolume(Number(e.currentTarget.value) / 100)}
			/>
		</div>
	</div>

	<!-- the circle -->
	<div class="mx-auto w-full max-w-560px text-blue-100">
		<CircleOfFifths
			positions={chordPlayer.positions}
			notes={chordPlayer.notes}
			mode={chordPlayer.mode}
			showSignatures={chordPlayer.showSignatures}
			{pressed}
			{centre}
			onpress={press}
			onrelease={release}
		/>
	</div>
	<div class="absolute right-5 bottom-3 text-11px tracking-wider opacity-60 select-none">
		SS FIFTHS 001
	</div>
</div>

{#snippet chordsMenuBlock()}
	<div class="px-3 pt-3 pb-4 grid gap-4 [&_span.device-button-label]-(block mb-2 text-blue-100/90)">
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
				>The circle turns so this key's chord sits at the top (or the bottom), its neighbours the
				chords that fit it best.</span
			>
		</label>
		<label class="flex items-center gap-2 text-13px text-blue-100/90">
			<input
				type="checkbox"
				class="accent-maximumYellow"
				checked={chordPlayer.keyAtTop}
				onchange={(e) => chordPlayer.setKeyAtTop(e.currentTarget.checked)}
			/>
			The key at the top (off: at the bottom)
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
	</div>
{/snippet}

{#snippet effectsMenuBlock()}
	<PianoEffectsMenu />
{/snippet}
