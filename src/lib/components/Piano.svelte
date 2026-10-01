<script lang="ts">
	import ComboBox from "$lib/components/ComboBox.svelte";
	import ContextMenu from "$lib/components/ContextMenu.svelte";
	import { piano } from "$lib/audio/piano.svelte";
	import { metronome } from "$lib/audio/metronome.svelte";
	import { BPM_MAX, BPM_MIN } from "$lib/utils/tapTempo";
	import { noteLabel } from "$lib/audio/pitch";
	import {
		BLACK_KEYS,
		PIANO_INSTRUMENTS,
		PIANO_KEY_CODES,
		PIANO_KEY_LABELS,
		PIANO_OCTAVE_MAX,
		PIANO_OCTAVE_MIN,
		type PianoInstrumentId,
	} from "$lib/constants/piano";
	import { isTextEntry } from "$lib/utils/isTextEntry";
	import { PITCH_CLASS_NAMES, SCALE_MODES, type ScaleModeId } from "$lib/constants/scales";
	import { nameChord } from "$lib/utils/chordName";
	import { degreeOf, scalePitchClasses } from "$lib/utils/scaleDegrees";
	import { PIANO_TIER_BYTES } from "$lib/audio/pianoSamples";
	import { notify } from "$lib/state/notifications.svelte";
	import { errorMessage } from "$lib/utils/errorMessage";
	import { decodePianoPreset } from "$lib/utils/decodePianoPreset";
	import { encodePianoPreset } from "$lib/utils/encodePianoPreset";
	import { pianoPresetKey } from "$lib/utils/pianoPresetKey";
	import { resolvePianoSlots, type PianoSlot } from "$lib/utils/resolvePianoSlots";
	import { loadPianoSlotOverrides, savePianoSlotOverrides } from "$lib/utils/pianoSlotOverrides";
	import {
		deletePianoPreset,
		renamePianoPreset,
		savePianoPreset,
		setPianoPresetSlot,
	} from "$lib/remote/pianoPresets.remote";
	import { clearSitePianoPreset, setSitePianoPreset } from "$lib/remote/admin.remote";
	import {
		PIANO_PRESET_SLOTS,
		type NamedPianoPreset,
		type PianoPresetData,
	} from "$lib/val/PianoPresetSchema";
	import { onDestroy, onMount, type Snippet } from "svelte";
	import type { Attachment } from "svelte/attachments";

	/**
	 * The piano (docs/piano.md): a keyboard of two or three octaves played by
	 * pointer (several fingers at once, a slide across the keys), by the
	 * computer keyboard (two rows, the way software instruments map it) or
	 * by a MIDI controller; a screen naming the sound, the octave and the
	 * notes sounding; the sound, octave, sustain, volume, reverb and MIDI
	 * controls. The engine is the page's one piano (src/lib/audio/piano.svelte.ts).
	 */
	interface Props {
		/** The computer keyboard plays; off where a page needs the keys for something else. */
		keyboard?: boolean;
		/** Fetch the Grand Piano's samples at mount (the piano page); off, they come with the first touch (the home page's demo). */
		warm?: boolean;
		/** Where the standard and hi-res sample tiers live (the page's load); without it the demo tier is all there is. */
		samplesBase?: string | null;
		/** The site's five demo presets (a system admin's), a null per empty slot (docs/piano.md, "Presets"); without them the preset buttons do not show. */
		sitePresets?: (NamedPianoPreset | null)[] | null;
		/** A signed-in member's account: presets save to it and load from it. */
		account?: { id: string; name: string; canEdit: boolean } | null;
		/** The account's saved presets, slotted ones first. */
		presets?: SavedPreset[];
		/** A system admin: a preset can be saved as the site's default for its slot. */
		presetAdmin?: boolean;
		/** The page's metronome in the controls row (the piano page; the recorder has its own in the toolbar, the home page none). */
		metronome?: boolean;
	}
	interface SavedPreset {
		id: string;
		name: string;
		slot: number | null;
		data: PianoPresetData;
	}
	let {
		keyboard = true,
		warm = false,
		samplesBase = null,
		sitePresets = null,
		account = null,
		presets = [],
		presetAdmin = false,
		metronome: withMetronome = false,
	}: Props = $props();

	let hiresCached = $state(false);
	onMount(() => {
		piano.samplesBase = samplesBase;
		piano.load(warm);
		if (withMetronome) metronome.load();
		void piano.hiresCached().then((c) => (hiresCached = c));
	});
	const mb = (bytes: number) => `${Math.round(bytes / 1e6)} MB`;
	/** The hi-res download's size: FLAC, or the mp3 variant where the browser has no FLAC. */
	let hiresBytes = $derived(
		piano.flac === false ? PIANO_TIER_BYTES.hiresMp3 : PIANO_TIER_BYTES.hires,
	);
	// The Hi-res button: off, loading (a spinner and the percentage from the press until the last file), or on.
	let hiresState = $derived(
		piano.tier === "hires" ? "on" : piano.loadingTiers.hires ? "loading" : "off",
	);
	const percent = (p: { done: number; total: number } | undefined) =>
		p?.total ? `${Math.round((100 * p.done) / p.total)}%` : "0%";
	/** What the screen says about a tier on its way: hi-res first, since that is the one someone pressed for. */
	let tierProgress = $derived(
		piano.loadingTiers.hires
			? `hi-res samples ${percent(piano.loadingTiers.hires)}`
			: piano.loadingTiers.standard
				? `standard samples ${percent(piano.loadingTiers.standard)}`
				: null,
	);
	onDestroy(() => piano.allOff());

	const INSTRUMENT_OPTIONS = PIANO_INSTRUMENTS.map((i) => ({ value: i.id, label: i.label }));
	const instrumentLabel = (id: PianoInstrumentId) =>
		PIANO_INSTRUMENTS.find((i) => i.id === id)?.label ?? id;

	// The keyboard shows three octaves where there is room, two on a phone; and on a
	// phone it stands on end: the keys run down the screen, low notes at the bottom,
	// black keys along the left, so each key is a finger wide and the height of the
	// screen is what gets used.
	let width = $state(0);
	let height = $state(0);
	const measure: Attachment<HTMLElement> = (el) => {
		const ro = new ResizeObserver(([entry]) => {
			width = entry?.contentRect.width ?? 0;
			height = entry?.contentRect.height ?? 0;
		});
		ro.observe(el);
		return () => ro.disconnect();
	};
	let vertical = $derived(width > 0 && width < 640);
	let octaves = $derived(width >= 720 ? 3 : 2);
	/** A white key on end is at least this tall, so a finger lands on one key. */
	const MIN_KEY = 52;
	/** White keys shown: whole octaves lying down; on end, as many as the board's height takes at the minimum size (a partial octave, then). */
	let whites = $derived(
		vertical
			? Math.max(7, Math.min(15, Math.floor((height || MIN_KEY * 10) / MIN_KEY)))
			: 7 * octaves + 1,
	);
	/** White key index within an octave per semitone (black keys sit after the white before them). */
	const WHITE_INDEX = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
	let keys = $derived.by(() => {
		const base = piano.base;
		const out: { midi: number; black: boolean; left: number; width: number; label: string }[] = [];
		const w = 100 / whites;
		for (let s = 0; s < 12 * 8; s++) {
			const octave = Math.floor(s / 12);
			const semitone = s % 12;
			const black = BLACK_KEYS.has(semitone);
			const whiteIndex = octave * 7 + WHITE_INDEX[semitone]!;
			if (whiteIndex >= whites) break;
			// A black key needs the white on each side of it.
			if (black && whiteIndex + 1 >= whites) continue;
			out.push({
				midi: base + s,
				black,
				left: black ? (whiteIndex + 0.7) * w : whiteIndex * w,
				width: black ? w * 0.6 : w,
				label: PIANO_KEY_LABELS[s] ?? "",
			});
		}
		return out;
	});
	/** The highest note on the board, for the screen. */
	let top = $derived(keys.length ? keys[keys.length - 1]!.midi : piano.base);
	let sounding = $derived(new Set(piano.sounding));
	/** The Effects button lights while any effect is up. */
	let fxOn = $derived(
		piano.reverb > 0 ||
			piano.delay.level > 0 ||
			piano.chorus.mix > 0 ||
			piano.tremolo.depth > 0 ||
			piano.fuzz.drive > 0 ||
			piano.wah.mix > 0 ||
			piano.phaser.mix > 0 ||
			piano.rotary.speed !== "off" ||
			piano.tone.tilt !== 0 ||
			piano.tone.air > 0 ||
			piano.tone.bottom > 0,
	);

	// The key helper: the scale's pitch classes for the marks on the keys, and the chord the held notes make.
	const ROOT_OPTIONS = PITCH_CLASS_NAMES.map((n, i) => ({ value: String(i), label: n }));
	const MODE_OPTIONS = SCALE_MODES.map((m) => ({ value: m.id, label: m.label }));
	let inKey = $derived(piano.key ? scalePitchClasses(piano.key) : null);
	let chord = $derived(nameChord(piano.sounding, piano.key));
	/** What the readout says: the chord (with its numeral in the key), or the notes, or silence. */
	let readout = $derived(
		!chord ? "silent" : chord.numeral ? `${chord.name} · ${chord.numeral}` : chord.name,
	);
	function setKeyRoot(root: number) {
		piano.setKey({ root, mode: piano.key?.mode ?? "major" });
	}
	function setKeyMode(mode: ScaleModeId | "none") {
		piano.setKey(mode === "none" ? null : { root: piano.key?.root ?? 0, mode });
	}

	// Pointers: each finger or the mouse holds one note; sliding onto another key moves it there.
	const pointers = new Map<number, number>();
	let board = $state<HTMLElement | null>(null);
	function keyAt(x: number, y: number): { midi: number; velocity: number } | null {
		const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-note]");
		if (!el || !board?.contains(el)) return null;
		const r = el.getBoundingClientRect();
		// Lower on a key, louder (nearer the player's edge, the right, when the keys stand on end).
		const along = vertical ? (x - r.left) / r.width : (y - r.top) / r.height;
		const velocity = 0.55 + 0.45 * Math.min(1, Math.max(0, along));
		return { midi: Number(el.dataset.note), velocity };
	}
	function pointerDown(e: PointerEvent) {
		if (e.button !== 0 && e.pointerType === "mouse") return;
		piano.warm();
		const hit = keyAt(e.clientX, e.clientY);
		if (!hit) return;
		e.preventDefault();
		board?.setPointerCapture(e.pointerId);
		pointers.set(e.pointerId, hit.midi);
		piano.noteOn(hit.midi, hit.velocity);
	}
	function pointerMove(e: PointerEvent) {
		const was = pointers.get(e.pointerId);
		if (was === undefined) return;
		const hit = keyAt(e.clientX, e.clientY);
		if (!hit || hit.midi === was) return;
		piano.noteOff(was);
		pointers.set(e.pointerId, hit.midi);
		piano.noteOn(hit.midi, hit.velocity);
	}
	function pointerUp(e: PointerEvent) {
		const was = pointers.get(e.pointerId);
		if (was === undefined) return;
		pointers.delete(e.pointerId);
		piano.noteOff(was);
	}

	// The computer keyboard: two rows of notes, arrows for the octave, space for the pedal, escape for silence.
	const downCodes = new Set<string>();
	function onkeydown(e: KeyboardEvent) {
		if (!keyboard || e.metaKey || e.ctrlKey || e.altKey || isTextEntry(e.target)) return;
		if (e.code === "Space") {
			e.preventDefault();
			piano.setSustain(true);
			return;
		}
		if (e.code === "ArrowUp" || e.code === "ArrowDown") {
			e.preventDefault();
			piano.setOctave(piano.octave + (e.code === "ArrowUp" ? 1 : -1));
			return;
		}
		if (e.code === "Escape") {
			piano.allOff();
			return;
		}
		const semitone = PIANO_KEY_CODES[e.code];
		if (semitone === undefined || e.repeat || downCodes.has(e.code)) return;
		e.preventDefault();
		piano.warm();
		downCodes.add(e.code);
		piano.noteOn(piano.base + semitone, 0.8);
	}
	function onkeyup(e: KeyboardEvent) {
		if (e.code === "Space") {
			piano.setSustain(false);
			return;
		}
		const semitone = PIANO_KEY_CODES[e.code];
		if (semitone === undefined || !downCodes.delete(e.code)) return;
		piano.noteOff(piano.base + semitone);
	}
	function onblur() {
		downCodes.clear();
		piano.allOff();
	}
	const midiSupported = typeof navigator !== "undefined" && "requestMIDIAccess" in navigator;

	// ---- presets (docs/piano.md, "Presets") ----
	// Seeded from the page's load, then kept here as saves and deletes happen.
	// svelte-ignore state_referenced_locally
	let site = $state<(NamedPianoPreset | null)[]>(sitePresets ?? []);
	// svelte-ignore state_referenced_locally
	let saved = $state<SavedPreset[]>(presets);
	let overrides = $state<Record<number, NamedPianoPreset>>({});
	/** The last preset loaded (a slot, the library or a link): the screen names it, "edited" once the sound drifts from it. */
	let loaded = $state<NamedPianoPreset | null>(null);
	let slots = $derived(resolvePianoSlots(site, overrides, account ? saved : null));
	let currentKey = $derived(pianoPresetKey(piano.currentPreset()));
	let activeSlot = $derived(slots.findIndex((p) => p && pianoPresetKey(p.data) === currentKey));
	/** What the screen says: the slot the sound sits on, else the loaded preset, edited or not. */
	let presetLine = $derived.by(() => {
		const slot = activeSlot >= 0 ? slots[activeSlot] : null;
		if (slot) return { name: slot.name, edited: false };
		if (loaded) return { name: loaded.name, edited: pianoPresetKey(loaded.data) !== currentKey };
		return null;
	});
	const SLOT_NUMBERS = Array.from({ length: PIANO_PRESET_SLOTS }, (_, i) => i + 1);
	onMount(() => {
		overrides = loadPianoSlotOverrides();
		// A share link: the preset in the hash plays at once, named on the screen, kept by saving it.
		const hash = window.location.hash;
		if (hash.startsWith("#preset=")) {
			const preset = decodePianoPreset(hash.slice("#preset=".length));
			if (preset) {
				piano.load();
				loadPreset(preset);
				notify(`Preset “${preset.name}” loaded from the link; save it to keep it`);
			} else notify("That preset link could not be read", { kind: "error" });
		}
	});
	function loadPreset(preset: NamedPianoPreset) {
		piano.applyPreset(preset.data);
		loaded = { name: preset.name, data: preset.data };
	}
	function loadSlot(n: number) {
		const p = slots[n - 1];
		if (p) loadPreset(p);
		else openSave(n);
	}
	// Saving: a popover with the name and the slot, opened by ⌘-click (Ctrl on Windows) or a hold on a slot button, or from the manage menu.
	let saveOpen = $state<"open" | "closed">("closed");
	/** The wide layout's presets group (shown from @4xl), so a save knows which menu to open. */
	let wideControls: HTMLElement | null = $state(null);
	let saveOpenPhone = $state<"open" | "closed">("closed");
	let saveSlot = $state<number | null>(null);
	let saveName = $state("");
	let saving = $state(false);
	let search = $state("");
	/** The manage button itself opens the popover with no slot chosen and the current name (a pointer on the trigger, not the synthetic click openSave makes). */
	function freshSaveForm(e: PointerEvent) {
		const t = e.target as HTMLElement;
		if (t.closest("button[popovertarget]") && !t.closest("[popover]")) {
			saveSlot = null;
			saveName = presetLine?.name ?? "";
		}
	}
	function openSave(n: number | null) {
		saveSlot = n;
		const held = n ? slots[n - 1] : null;
		saveName = held?.source === "account" ? held.name : (presetLine?.name ?? "");
		// Whichever manage button the container's width shows (a container query, not the window's).
		if (wideControls && getComputedStyle(wideControls).display !== "none") saveOpen = "open";
		else saveOpenPhone = "open";
	}
	// A hold marks the press; the click that follows the release opens the save popover (opening it
	// mid-press would hand the release to light dismiss, which would close it again).
	let holdTimer: ReturnType<typeof setTimeout> | null = null;
	let holdFired = false;
	function holdStart() {
		holdFired = false;
		holdTimer = setTimeout(() => (holdFired = true), 550);
	}
	function holdEnd() {
		if (holdTimer) clearTimeout(holdTimer);
		holdTimer = null;
	}
	function slotClick(e: MouseEvent, n: number) {
		const held = holdFired;
		holdFired = false;
		if (held || e.metaKey || e.ctrlKey) openSave(n);
		else loadSlot(n);
	}
	let filtered = $derived(
		search.trim()
			? saved.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()))
			: saved,
	);
	/** Save what the piano holds now: to the account (replacing the account's own preset on the slot, else a new one), or into this browser's slot. */
	async function savePreset() {
		const name = saveName.trim() || "Untitled preset";
		const data = piano.currentPreset();
		if (account?.canEdit) {
			const held = saveSlot ? slots[saveSlot - 1] : null;
			const id = held?.source === "account" ? held.id : undefined;
			saving = true;
			try {
				const row = await savePianoPreset({
					accountId: account.id,
					id,
					name,
					slot: saveSlot,
					data,
				});
				saved = [
					{ id: row.id, name: row.name, slot: row.slot, data },
					...saved
						.filter((p) => p.id !== row.id)
						.map((p) => (p.slot && p.slot === row.slot ? { ...p, slot: null } : p)),
				];
				loaded = { name: row.name, data };
				notify(saveSlot ? `“${row.name}” saved to preset ${saveSlot}` : `“${row.name}” saved`);
			} catch (e) {
				notify(`Could not save the preset: ${errorMessage(e)}`, { kind: "error" });
			} finally {
				saving = false;
			}
		} else if (saveSlot) {
			overrides = { ...overrides, [saveSlot]: { name, data } };
			savePianoSlotOverrides(overrides);
			loaded = { name, data };
			notify(`“${name}” saved to preset ${saveSlot} in this browser`);
		}
		saveOpen = "closed";
		saveOpenPhone = "closed";
	}
	/** A system admin: the sound as the site's default for the slot, what every visitor's button holds until they save their own. */
	async function saveSitePreset() {
		if (!saveSlot) return;
		const name = saveName.trim() || "Untitled preset";
		const data = piano.currentPreset();
		saving = true;
		try {
			await setSitePianoPreset({ slot: saveSlot, name, data });
			site = site.map((p, i) => (i === saveSlot! - 1 ? { name, data } : p));
			while (site.length < PIANO_PRESET_SLOTS) site.push(null);
			loaded = { name, data };
			notify(`“${name}” is now the site's preset ${saveSlot}`);
		} catch (e) {
			notify(`Could not save the site preset: ${errorMessage(e)}`, { kind: "error" });
		} finally {
			saving = false;
		}
		saveOpen = "closed";
		saveOpenPhone = "closed";
	}
	async function clearSitePreset(n: number) {
		if (!window.confirm(`Clear the site's preset ${n}?`)) return;
		try {
			await clearSitePianoPreset({ slot: n });
			site = site.map((p, i) => (i === n - 1 ? null : p));
			notify(`Site preset ${n} cleared`);
		} catch (e) {
			notify(`Could not clear it: ${errorMessage(e)}`, { kind: "error" });
		}
	}
	function clearBrowserSlot(n: number) {
		const { [n]: _gone, ...rest } = overrides;
		overrides = rest;
		savePianoSlotOverrides(overrides);
		notify(`Preset ${n} is back to the site's`);
	}
	async function renameSaved(p: SavedPreset) {
		const name = window.prompt("Rename the preset", p.name)?.trim();
		if (!name || name === p.name) return;
		try {
			const row = await renamePianoPreset({ id: p.id, name });
			saved = saved.map((x) => (x.id === row.id ? { ...x, name: row.name } : x));
			if (loaded && pianoPresetKey(loaded.data) === pianoPresetKey(p.data))
				loaded = { ...loaded, name: row.name };
		} catch (e) {
			notify(`Could not rename the preset: ${errorMessage(e)}`, { kind: "error" });
		}
	}
	async function deleteSaved(p: SavedPreset) {
		if (!window.confirm(`Delete “${p.name}”?`)) return;
		try {
			await deletePianoPreset({ id: p.id });
			saved = saved.filter((x) => x.id !== p.id);
			notify(`“${p.name}” deleted`);
		} catch (e) {
			notify(`Could not delete the preset: ${errorMessage(e)}`, { kind: "error" });
		}
	}
	async function placeSaved(p: SavedPreset, slot: number | null) {
		try {
			const row = await setPianoPresetSlot({ id: p.id, slot });
			saved = saved.map((x) =>
				x.id === row.id
					? { ...x, slot: row.slot }
					: x.slot && x.slot === row.slot
						? { ...x, slot: null }
						: x,
			);
		} catch (e) {
			notify(`Could not move the preset: ${errorMessage(e)}`, { kind: "error" });
		}
	}
	/** A link that opens the piano with a preset: a saved one, or the sound as it stands. */
	async function copyLink(preset?: NamedPianoPreset) {
		const p = preset ?? {
			name: presetLine?.name ?? instrumentLabel(piano.instrument),
			data: piano.currentPreset(),
		};
		const url = `${window.location.origin}/piano#preset=${encodePianoPreset(p)}`;
		try {
			await navigator.clipboard.writeText(url);
			notify(`Link to “${p.name}” copied`);
		} catch {
			window.prompt("Copy this link", url);
		}
	}
	const SLOT_OPTIONS = [
		{ value: "", label: "–" },
		...SLOT_NUMBERS.map((n) => ({ value: String(n), label: String(n) })),
	];
</script>

<svelte:window {onkeydown} {onkeyup} {onblur} />

<div
	class="
		@container
		device-chrome
		gap-3
		grid
		pb-12
		px-3
		py-4
		@xl-gap-x-4
		@xl-gap-y-4
		@xl-pr-5
		@xl-pl-10
		@2xl-px-5
		@xl-pt-5

		w-full
		max-w-full
		relative"
	aria-label="Piano"
>
	<!-- the screen -->
	<div
		class="device-screen flex flex-wrap items-end justify-between gap-x-6 gap-y-2 px-4 py-3 transition-opacity {piano.on
			? ''
			: '[&>*]-(opacity-25)'}"
	>
		<div>
			<div class="text-24px @xl-text-32px leading-none">{instrumentLabel(piano.instrument)}</div>
			{#if presetLine}
				<div
					class="mt-1 text-13px @xl-text-14px opacity-85 flex items-center gap-1.5"
					data-testid="preset-line"
				>
					<span class="i-ph-bookmark-simple text-12px" aria-hidden="true"></span>
					<span>{presetLine.name}{presetLine.edited ? " · edited" : ""}</span>
				</div>
			{/if}
			<div class="mt-2 text-12px opacity-70 flex flex-wrap gap-x-2">
				<span>{noteLabel(piano.base)} to {noteLabel(top)}</span>
				<span>· {piano.sustain ? "sustain" : "no sustain"}</span>
				{#if piano.instrument === "grand" && piano.samples === "loading"}
					<span>· loading the piano…</span>
				{:else if piano.instrument === "grand" && piano.samples === "failed"}
					<span class="text-red-300">· the piano's samples did not load</span>
				{:else if piano.instrument === "grand" && tierProgress}
					<span>· {tierProgress}</span>
				{:else if piano.instrument === "grand" && piano.tier !== "demo"}
					<span>· {piano.tier === "hires" ? "hi-res" : "standard"} samples</span>
				{/if}
				{#if !piano.on}
					<span
						>· {piano.starting ? "starting…" : "off"}{#if piano.wake}
							· audio {piano.wake.state} at {piano.wake.seconds.toFixed(1)} s{/if}</span
					>
				{/if}
				{#if piano.midi.status === "on"}
					<span>· MIDI: {piano.midi.inputs.join(", ") || "no inputs"}</span>
				{/if}
				{#if withMetronome && metronome.running}
					<span class="tabular-nums">· {metronome.bpm} bpm · beat {metronome.beat + 1}</span>
				{/if}
			</div>
		</div>
		<div
			class="text-12px opacity-70 rounded border border-current/40 px-2 py-1 min-w-24 text-center"
			aria-live="polite"
		>
			{readout}
		</div>
	</div>

	<div class="grid grid-cols-1 gap-x-3 gap-y-4 @xl-flex">
		<!-- the controls -->
		<div
			class="
				gap-2
			 	w-full
				grid
				grid-cols-[auto_1fr_auto_auto]
				place-content-start
				@2xl-grid-cols-[auto_auto_auto_auto_1fr]
				@4xl-grid-cols-[auto_auto_auto_auto_auto_auto_auto_1fr]
				@2xl-gap-3"
		>
			<!-- power -->
			<div class="">
				<div class="hidden @4xl-block device-button-group-label text-dark @4xl-max-w-fit">
					Power
				</div>
				<!-- on / off -->
				<button
					class="device-button-sm @4xl-device-button-xs px-3 text-15px @4xl-text-14px {piano.on
						? 'text-accent'
						: ''}"
					type="button"
					aria-pressed={piano.on}
					aria-busy={piano.starting}
					title={piano.on ? "Turn the piano off" : "Turn the piano on"}
					onclick={() => void piano.setOn(!piano.on)}
				>
					<span
						class={piano.starting ? "i-ph-circle-notch animate-spin" : "i-ph-power"}
						aria-hidden="true"
					></span>
					<span class="hidden @xl-inline-block @4xl-hidden">{piano.on ? "On" : "Off"}</span>
				</button>
			</div>

			<!-- instrument voice -->
			<div class="min-w-28 flex-none @2xl-text-14px">
				<div class="device-button-group-label text-dark hidden @4xl-block">Sound</div>
				<ComboBox
					ariaLabel="Sound"
					clearDefaultButtonClasses={true}
					popoverClasses="text-15px"
					buttonClasses="device-button-sm @4xl-device-button-xs px-3 text-15px @4xl-text-14px w-full"
					options={INSTRUMENT_OPTIONS}
					value={piano.instrument}
					onchange={(v) => piano.setInstrument(v as PianoInstrumentId)}
				/>
			</div>

			<!-- octave selector -->
			<div class="text-14px">
				<div class="device-button-group-label text-dark hidden @4xl-block">Octave</div>
				<div class="flex items-center gap-1 @2xl-gap-2 @4xl-gap-1" role="group" aria-label="Octave">
					<button
						class="min-w-10 device-button-sm @4xl-device-button-xs @4xl-min-w-8 px-2 @xl-px-3"
						type="button"
						disabled={piano.octave <= PIANO_OCTAVE_MIN}
						aria-label="Octave down"
						title="Octave down (arrow down)"
						onclick={() => piano.setOctave(piano.octave - 1)}>−</button
					>
					<span
						class="
							bg-dark
							inline-flex
							h-38.5px
							items-center
							justify-center
							min-w-10
							rounded-md
							tabular-nums
							text-14px
							text-center
							@4xl-h-28px
							@4xl-min-w-9
							@4xl-text-14px
							{piano.on ? 'text-blue-100/90' : 'text-blue-100/20'} font-500">C{piano.octave}</span
					>
					<button
						class="min-w-10 device-button-sm px-2 @xl-px-3 @4xl-min-w-8 @4xl-device-button-xs"
						type="button"
						disabled={piano.octave >= PIANO_OCTAVE_MAX}
						aria-label="Octave up"
						title="Octave up (arrow up)"
						onclick={() => piano.setOctave(piano.octave + 1)}>+</button
					>
				</div>
			</div>

			<!-- key selector -->
			<!-- <div class="hidden @4xl-block [&_.device-button-group-label]-text-dark">
				{@render keyControls(false)}
			</div> -->

			<!-- effects button -->
			<div class="hidden @4xl-block">
				<div class="device-button-group-label text-dark">Effects</div>
				<!-- Reverb and delay in a menu, as the drum machine's; the button lights while either is up. -->
				<ContextMenu
					ariaLabel="Effects"
					title="Reverb and delay"
					iconClass="i-ph-sliders-horizontal"
					label="Effects"
					position="bottom right"
					buttonBaseClasses="device-button-xs px-3"
					buttonClasses={fxOn ? "text-accent" : ""}
					popoverClasses="min-w-72 @4xl-min-w-160 !max-h-[calc(100%-0.5rem)] overflow-y-auto"
					items={[
						{ id: "effect-menu-heading", kind: "heading", label: "Effects" },
						{ id: "piano-fx", kind: "snippet", snippet: fxSlidersMenuBlock },
					]}
				/>
			</div>

			<!-- presets: five slot buttons and the manage menu (docs/piano.md, "Presets") -->
			{#if sitePresets}
				<div class="hidden @4xl-block" bind:this={wideControls}>
					<div class="device-button-group-label text-dark">Presets</div>
					<div class="flex gap-1 items-center">
						{@render slotButtons("device-button-xs w-8")}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div onpointerdowncapture={freshSaveForm}>
							<ContextMenu
								ariaLabel="Manage presets"
								title="Save, name, share and manage presets"
								iconClass="i-ph-bookmarks-simple"
								position="bottom right"
								buttonBaseClasses="device-button-xs px-2"
								popoverClasses="min-w-80 !max-h-[calc(100%-0.5rem)] overflow-y-auto"
								bind:openState={saveOpen}
								items={[
									{ id: "presets-heading", kind: "heading", label: "Presets" },
									{ id: "presets-body", kind: "snippet", snippet: presetsMenuBlock },
								]}
							/>
						</div>
					</div>
				</div>
			{/if}

			<!-- controls block -->
			<div class="hidden @4xl-block place-content-start">
				<!-- label -->
				<div class="device-button-group-label text-dark">More</div>
				<div class="flex gap-1 items-end">
					<!-- sustain pedal -->
					<div class="hidden @4xl-block @4xl-w-32px">
						<div class="device-button-group-label text-dark sr-only">Pedal</div>
						<button
							class="device-button-xs {piano.sustain ? 'text-accent' : ''}"
							type="button"
							aria-pressed={piano.sustain}
							title="Sustain: notes ring on after you let go (hold the space bar)"
							onclick={() => piano.setSustain(!piano.sustain)}
						>
							<span class="i-ph-waves" aria-hidden="true"></span>
							<span class="sr-only">Sustain</span>
						</button>
					</div>

					<!-- midi -->
					{#if midiSupported}
						<div class="hidden @4xl-block @4xl-w-32px">
							<div class="device-button-group-label text-dark @4xl-sr-only">MIDI</div>
							{@render midiButton("device-button-xs")}
						</div>
					{/if}

					<!-- hi-res -->
					{#if samplesBase}
						<div class="hidden @4xl-block">
							<div class="device-button-group-label text-dark sr-only">Samples</div>
							{@render hiresButton("device-button-xs px-1 @4xl-w-8")}
						</div>
					{/if}

					<div class="hidden @4xl-block">
						{@render keyControls(false)}
					</div>

					<!-- Toggle computer key letter labels on piano keys -->
					<div class="hidden @4xl-block">
						<div class="device-button-group-label text-dark sr-only">Keys</div>
						<button
							class="device-button-xs {piano.labels ? 'text-accent' : ''}"
							type="button"
							aria-pressed={piano.labels}
							aria-label="Keyboard letters on the keys"
							title={piano.labels
								? "Hide the computer-key letters on the keys"
								: "Show the computer-key letters on the keys"}
							onclick={() => piano.setLabels(!piano.labels)}
						>
							<span class="i-ph-keyboard text-14px" aria-hidden="true"></span>
						</button>
					</div>
					<!-- metronome (docs/piano.md, "Metronome"): the page's, in a menu -->
					{#if withMetronome}
						<div class="hidden @4xl-block @4xl-w-32px">
							<div class="device-button-group-label text-dark sr-only">Metronome</div>
							<ContextMenu
								ariaLabel="Metronome"
								title={metronome.running
									? `Metronome running at ${metronome.bpm} bpm`
									: "Metronome: tempo, tap and start"}
								iconClass="i-ph-metronome"
								position="bottom left"
								buttonBaseClasses="device-button-xs"
								buttonClasses={metronome.running ? "text-accent" : ""}
								popoverClasses="min-w-64"
								items={[
									{ id: "metronome-heading", kind: "heading", label: "Metronome" },
									{ id: "metronome-body", kind: "snippet", snippet: metronomeMenuBlock },
								]}
							/>
						</div>
					{/if}
				</div>
			</div>

			<!-- context menu -->
			<div>
				<ContextMenu
					ariaLabel="Levels and MIDI"
					title="Volume, reverb and MIDI"
					iconClass="i-ph-sliders-horizontal"
					position="bottom left"
					buttonBaseClasses="device-button-sm px-2 w-10 @4xl-hidden @4xl-w-8"
					popoverClasses="min-w-72 !max-h-[calc(100%-0.5rem)] overflow-y-auto"
					items={[{ id: "menu-sections", kind: "snippet", snippet: compactMenuBlock }]}
				/>
			</div>

			<!-- volume -->
			<label
				class="
					hidden
					w-36
					@2xl-block
					@2xl-ml-auto
					@4xl-grid
					@4xl-grid-cols-1
					@4xl-grid-rows-[auto_28px]
					@4xl-h-57.25px
					@4xl-max-w-280px
					@4xl-w-auto"
			>
				<span
					class="
					@4xl-device-button-group-label
					hidden
					text-dark
					text-14px
					text-blue-100/90
					w-full
					@2xl-block">Volume</span
				>
				<div class="flex items-center h-28px">
					<!-- {Math.round(piano.volume * 100)}% -->
					{@render volumeSlider()}
				</div>
			</label>
		</div>
	</div>

	<!-- the keys -->
	<div
		class="relative w-full select-none touch-none rounded-md overflow-hidden {vertical
			? 'h-[78vh] min-h-560px'
			: 'h-160px @xl-h-200px'}"
		role="group"
		aria-label="Keys"
		bind:this={board}
		{@attach measure}
		onpointerdown={pointerDown}
		onpointermove={pointerMove}
		onpointerup={pointerUp}
		onpointercancel={pointerUp}
	>
		{#each keys as key (key.midi)}
			{@const on = sounding.has(key.midi)}
			{@const pc = key.midi % 12}
			{@const outKey = !!inKey && !inKey.has(pc)}
			{@const isRoot = !!piano.key && piano.key.root === pc}
			{@const degree = piano.key && piano.degrees ? degreeOf(pc, piano.key) : null}
			<button
				class="absolute flex items-center border border-oxford-950/60 text-11px font-500 transition-colors duration-75 {vertical
					? 'left-0 flex-row justify-end pr-3 gap-2'
					: 'top-0 flex-col justify-end pb-2'} {key.black
					? `z-10 ${vertical ? 'w-62% rounded-r' : 'h-60% rounded-b'} ${on ? 'bg-accent text-oxford' : outKey ? 'bg-slate-800 text-slate-500' : 'bg-slate-900 text-slate-300 hover-bg-slate-800'}`
					: `${vertical ? 'w-full rounded-r-md' : 'h-full rounded-b-md'} ${on ? 'bg-accent text-oxford' : outKey ? 'bg-slate-300 text-slate-500' : 'bg-slate-100 text-slate-500 hover-bg-white'}`}"
				style={vertical
					? `top: ${100 - key.left - key.width}%; height: ${key.width}%`
					: `left: ${key.left}%; width: ${key.width}%`}
				type="button"
				data-note={key.midi}
				aria-label={noteLabel(key.midi)}
				aria-pressed={on}
				tabindex="-1"
			>
				<!-- In a key: a mark on the scale's keys, stronger on the root. -->
				{#if inKey && !outKey}
					<span
						class="{vertical ? 'mr-auto ml-3' : 'mb-1'} block h-1.5 w-1.5 rounded-full {isRoot
							? 'bg-purple-500'
							: on
								? 'bg-blue-200'
								: key.black
									? 'bg-blue-400'
									: 'bg-blue-400'}"
						aria-hidden="true"
					></span>
				{/if}
				{#if vertical}
					{#if key.midi % 12 === 0}<span class="text-10px">{noteLabel(key.midi)}</span>{/if}
					{#if degree !== null}<span class="opacity-70">{degree}</span>{/if}
				{:else}
					<!-- Two fixed rows on every key, so the letters line up: the octave name (on the Cs) above, the letter or degree below. -->

					<span
						class="block h-3 leading-4 mb-2 {key.black
							? 'text-blue-400'
							: 'text-blue-400'} {degree === 1 || key.label === '1' ? '!text-purple-500' : ''}"
						>{degree !== null ? degree : piano.labels ? key.label : ""}</span
					>
					<span
						class="block h-4 text-10px leading-3 absolute top-2 w-full text-center text-blue-900"
						>{key.midi % 12 === 0 ? noteLabel(key.midi) : ""}</span
					>
				{/if}
			</button>
		{/each}
	</div>

	{#snippet hiresButton(classes?: string)}
		<button
			class="{classes} {hiresState === 'on' ? 'text-accent' : ''}"
			type="button"
			aria-pressed={hiresState === "on"}
			disabled={hiresState !== "off"}
			title={hiresState === "on"
				? piano.flac === false
					? "The full samples are in: six velocity layers and the release samples, as mp3 (this browser does not decode FLAC)"
					: "The lossless samples are in: six velocity layers and the release samples"
				: piano.instrument !== "grand"
					? "The Grand Piano's fullest samples; pressing this chooses the Grand Piano"
					: hiresCached
						? "The fullest samples, kept from last time (no download)"
						: piano.flac === false
							? `Download the fullest samples, ${mb(hiresBytes)}, once, as mp3 (this browser does not decode FLAC); the browser keeps them for next time`
							: `Download the lossless samples, ${mb(hiresBytes)}, once; the browser keeps them for next time`}
			onclick={() => piano.enableHires()}
		>
			<span
				class={hiresState === "loading" ? "i-ph-circle-notch animate-spin" : "i-ph-sparkle"}
				aria-hidden="true"
			></span>
			<span class="@4xl-sr-only"
				>{hiresState === "on"
					? "Hi-res"
					: hiresState === "loading"
						? `Hi-res ${percent(piano.loadingTiers.hires)}`
						: hiresCached
							? "Hi-res"
							: `Hi-res · ${mb(hiresBytes)}`}
			</span>
		</button>
	{/snippet}

	{#snippet hiresButtonMenuBlock()}
		<div class="px-3 pt-3 grid grid-cols-1 w-full text-blue-100/90">
			{@render hiresButton("device-button-sm bg-slate-800 border")}
		</div>
	{/snippet}

	{#snippet fxSlidersMenuBlock()}
		<div
			class="px-3 pt-3 [&_span]-(block mb-2 text-blue-100/90) grid grid-cols-1 @xl-grid-cols-2 @4xl-grid-cols-3 gap-x-6 gap-y-4 mb-4"
		>
			<div class="grid grid-cols-1 gap-y-3 content-start">
				<div class="device-button-group-label !text-blue-100/90 !mb-0">Reverb</div>
				<label class="block">
					<span class="device-button-label">Level · {Math.round(piano.reverb * 100)}%</span>
					<input
						class="w-full accent-maximumYellow"
						type="range"
						min="0"
						max="100"
						step="1"
						value={Math.round(piano.reverb * 100)}
						oninput={(e) => piano.setReverb(Number(e.currentTarget.value) / 100)}
						aria-label="Reverb"
					/>
				</label>
				<label class="block">
					<span class="device-button-label">Room size · {Math.round(piano.reverbSize * 100)}%</span>
					<input
						class="w-full accent-maximumYellow"
						type="range"
						min="0"
						max="100"
						step="1"
						value={Math.round(piano.reverbSize * 100)}
						oninput={(e) => piano.setReverbSize(Number(e.currentTarget.value) / 100)}
						aria-label="Reverb size"
					/>
				</label>
			</div>
			<div class="grid grid-cols-1 gap-y-3 content-start">
				<div class="device-button-group-label !text-blue-100/90 !mb-0">Delay</div>
				<label class="block">
					<span class="device-button-label">Level · {Math.round(piano.delay.level * 100)}%</span>
					<input
						class="w-full accent-maximumYellow"
						type="range"
						min="0"
						max="100"
						step="1"
						value={Math.round(piano.delay.level * 100)}
						oninput={(e) => piano.setDelay({ level: Number(e.currentTarget.value) / 100 })}
						aria-label="Delay level"
					/>
				</label>
				<label class="block">
					<span class="device-button-label">Time · {Math.round(piano.delay.time * 1000)} ms</span>
					<input
						class="w-full accent-maximumYellow"
						type="range"
						min="50"
						max="1000"
						step="10"
						value={Math.round(piano.delay.time * 1000)}
						oninput={(e) => piano.setDelay({ time: Number(e.currentTarget.value) / 1000 })}
						aria-label="Delay time"
					/>
				</label>
				<label class="block">
					<span class="device-button-label"
						>Feedback · {Math.round(piano.delay.feedback * 100)}%</span
					>
					<input
						class="w-full accent-maximumYellow"
						type="range"
						min="0"
						max="90"
						step="1"
						value={Math.round(piano.delay.feedback * 100)}
						oninput={(e) => piano.setDelay({ feedback: Number(e.currentTarget.value) / 100 })}
						aria-label="Delay feedback"
					/>
				</label>
				<div class="flex gap-2" role="group" aria-label="Delay character">
					<button
						class="flex-1 device-button-xs border {piano.delay.analog ? '' : 'text-accent'}"
						type="button"
						aria-pressed={!piano.delay.analog}
						title="Clean repeats"
						onclick={() => piano.setDelay({ analog: false })}>Digital</button
					>
					<button
						class="flex-1 device-button-xs border {piano.delay.analog ? 'text-accent' : ''}"
						type="button"
						aria-pressed={piano.delay.analog}
						title="Tape-like repeats: each one darker and softer, with a slow wobble"
						onclick={() => piano.setDelay({ analog: true })}>Analog</button
					>
				</div>
			</div>
			<div class="grid grid-cols-1 gap-y-3 content-start">
				<div class="device-button-group-label !text-blue-100/90 !mb-0">Fuzz</div>
				<label class="block">
					<span class="device-button-label">Drive · {Math.round(piano.fuzz.drive * 100)}%</span>
					<input
						class="w-full accent-maximumYellow"
						type="range"
						min="0"
						max="100"
						step="1"
						value={Math.round(piano.fuzz.drive * 100)}
						oninput={(e) => piano.setFuzz({ drive: Number(e.currentTarget.value) / 100 })}
						aria-label="Fuzz drive"
					/>
				</label>
				<label class="block">
					<span class="device-button-label">Tone · {Math.round(piano.fuzz.tone * 100)}%</span>
					<input
						class="w-full accent-maximumYellow"
						type="range"
						min="0"
						max="100"
						step="1"
						value={Math.round(piano.fuzz.tone * 100)}
						oninput={(e) => piano.setFuzz({ tone: Number(e.currentTarget.value) / 100 })}
						aria-label="Fuzz tone"
					/>
				</label>
			</div>
			<div class="grid grid-cols-1 gap-y-3 content-start">
				<div class="device-button-group-label !text-blue-100/90 !mb-0">Wah</div>
				<div class="flex gap-2" role="group" aria-label="Wah mode">
					<button
						class="flex-1 device-button-xs border {piano.wah.mode === 'touch' ? 'text-accent' : ''}"
						type="button"
						aria-pressed={piano.wah.mode === "touch"}
						title="The filter opens with how hard you play"
						onclick={() => piano.setWah({ mode: "touch" })}>Touch</button
					>
					<button
						class="flex-1 device-button-xs border {piano.wah.mode === 'sweep' ? 'text-accent' : ''}"
						type="button"
						aria-pressed={piano.wah.mode === "sweep"}
						title="The filter sweeps on its own"
						onclick={() => piano.setWah({ mode: "sweep" })}>Sweep</button
					>
				</div>
				<label class="block">
					<span class="device-button-label">Mix · {Math.round(piano.wah.mix * 100)}%</span>
					<input
						class="w-full accent-maximumYellow"
						type="range"
						min="0"
						max="100"
						step="1"
						value={Math.round(piano.wah.mix * 100)}
						oninput={(e) => piano.setWah({ mix: Number(e.currentTarget.value) / 100 })}
						aria-label="Wah mix"
					/>
				</label>
				{#if piano.wah.mode === "touch"}
					<label class="block">
						<span class="device-button-label"
							>Sensitivity · {Math.round(piano.wah.sensitivity * 100)}%</span
						>
						<input
							class="w-full accent-maximumYellow"
							type="range"
							min="0"
							max="100"
							step="1"
							value={Math.round(piano.wah.sensitivity * 100)}
							oninput={(e) => piano.setWah({ sensitivity: Number(e.currentTarget.value) / 100 })}
							aria-label="Wah sensitivity"
						/>
					</label>
				{:else}
					<label class="block">
						<span class="device-button-label">Rate · {piano.wah.rate.toFixed(1)} Hz</span>
						<input
							class="w-full accent-maximumYellow"
							type="range"
							min="0.1"
							max="5"
							step="0.1"
							value={piano.wah.rate}
							oninput={(e) => piano.setWah({ rate: Number(e.currentTarget.value) })}
							aria-label="Wah rate"
						/>
					</label>
				{/if}
				<label class="block">
					<span class="device-button-label">Range · {Math.round(piano.wah.range * 100)}%</span>
					<input
						class="w-full accent-maximumYellow"
						type="range"
						min="0"
						max="100"
						step="1"
						value={Math.round(piano.wah.range * 100)}
						oninput={(e) => piano.setWah({ range: Number(e.currentTarget.value) / 100 })}
						aria-label="Wah range"
					/>
				</label>
				<label class="block">
					<span class="device-button-label"
						>Resonance · {Math.round(piano.wah.resonance * 100)}%</span
					>
					<input
						class="w-full accent-maximumYellow"
						type="range"
						min="0"
						max="100"
						step="1"
						value={Math.round(piano.wah.resonance * 100)}
						oninput={(e) => piano.setWah({ resonance: Number(e.currentTarget.value) / 100 })}
						aria-label="Wah resonance"
					/>
				</label>
			</div>
			<div class="grid grid-cols-1 gap-y-3 content-start">
				<div class="device-button-group-label !text-blue-100/90 !mb-0">Chorus</div>
				<label class="block">
					<span class="device-button-label">Mix · {Math.round(piano.chorus.mix * 100)}%</span>
					<input
						class="w-full accent-maximumYellow"
						type="range"
						min="0"
						max="100"
						step="1"
						value={Math.round(piano.chorus.mix * 100)}
						oninput={(e) => piano.setChorus({ mix: Number(e.currentTarget.value) / 100 })}
						aria-label="Chorus mix"
					/>
				</label>
				<label class="block">
					<span class="device-button-label">Rate · {piano.chorus.rate.toFixed(1)} Hz</span>
					<input
						class="w-full accent-maximumYellow"
						type="range"
						min="0.1"
						max="5"
						step="0.1"
						value={piano.chorus.rate}
						oninput={(e) => piano.setChorus({ rate: Number(e.currentTarget.value) })}
						aria-label="Chorus rate"
					/>
				</label>
				<label class="block">
					<span class="device-button-label">Depth · {Math.round(piano.chorus.depth * 100)}%</span>
					<input
						class="w-full accent-maximumYellow"
						type="range"
						min="0"
						max="100"
						step="1"
						value={Math.round(piano.chorus.depth * 100)}
						oninput={(e) => piano.setChorus({ depth: Number(e.currentTarget.value) / 100 })}
						aria-label="Chorus depth"
					/>
				</label>
			</div>
			<div class="grid grid-cols-1 gap-y-3 content-start">
				<div class="device-button-group-label !text-blue-100/90 !mb-0">Tremolo</div>
				<label class="block">
					<span class="device-button-label">Depth · {Math.round(piano.tremolo.depth * 100)}%</span>
					<input
						class="w-full accent-maximumYellow"
						type="range"
						min="0"
						max="100"
						step="1"
						value={Math.round(piano.tremolo.depth * 100)}
						oninput={(e) => piano.setTremolo({ depth: Number(e.currentTarget.value) / 100 })}
						aria-label="Tremolo depth"
					/>
				</label>
				<label class="block">
					<span class="device-button-label">Rate · {piano.tremolo.rate.toFixed(1)} Hz</span>
					<input
						class="w-full accent-maximumYellow"
						type="range"
						min="0.5"
						max="12"
						step="0.1"
						value={piano.tremolo.rate}
						oninput={(e) => piano.setTremolo({ rate: Number(e.currentTarget.value) })}
						aria-label="Tremolo rate"
					/>
				</label>
				<div class="flex gap-2" role="group" aria-label="Tremolo shape">
					<button
						class="flex-1 device-button-xs border {piano.tremolo.shape === 'sine'
							? 'text-accent'
							: ''}"
						type="button"
						aria-pressed={piano.tremolo.shape === "sine"}
						title="A smooth swell"
						onclick={() => piano.setTremolo({ shape: "sine" })}>Smooth</button
					>
					<button
						class="flex-1 device-button-xs border {piano.tremolo.shape === 'square'
							? 'text-accent'
							: ''}"
						type="button"
						aria-pressed={piano.tremolo.shape === "square"}
						title="A hard on-off chop"
						onclick={() => piano.setTremolo({ shape: "square" })}>Chop</button
					>
				</div>
			</div>
			<div class="grid grid-cols-1 gap-y-3 content-start">
				<div class="device-button-group-label !text-blue-100/90 !mb-0">
					{piano.phaser.mode === "flanger" ? "Flanger" : "Phaser"}
				</div>
				<div class="flex gap-2" role="group" aria-label="Phaser or flanger">
					<button
						class="flex-1 device-button-xs border {piano.phaser.mode === 'phaser'
							? 'text-accent'
							: ''}"
						type="button"
						aria-pressed={piano.phaser.mode === "phaser"}
						title="Notches swept through the sound"
						onclick={() => piano.setPhaser({ mode: "phaser" })}>Phaser</button
					>
					<button
						class="flex-1 device-button-xs border {piano.phaser.mode === 'flanger'
							? 'text-accent'
							: ''}"
						type="button"
						aria-pressed={piano.phaser.mode === "flanger"}
						title="A jet-like sweep from a short delay"
						onclick={() => piano.setPhaser({ mode: "flanger" })}>Flanger</button
					>
				</div>
				<label class="block">
					<span class="device-button-label">Mix · {Math.round(piano.phaser.mix * 100)}%</span>
					<input
						class="w-full accent-maximumYellow"
						type="range"
						min="0"
						max="100"
						step="1"
						value={Math.round(piano.phaser.mix * 100)}
						oninput={(e) => piano.setPhaser({ mix: Number(e.currentTarget.value) / 100 })}
						aria-label="{piano.phaser.mode === 'flanger' ? 'Flanger' : 'Phaser'} mix"
					/>
				</label>
				<label class="block">
					<span class="device-button-label">Rate · {piano.phaser.rate.toFixed(1)} Hz</span>
					<input
						class="w-full accent-maximumYellow"
						type="range"
						min="0.1"
						max="5"
						step="0.1"
						value={piano.phaser.rate}
						oninput={(e) => piano.setPhaser({ rate: Number(e.currentTarget.value) })}
						aria-label="{piano.phaser.mode === 'flanger' ? 'Flanger' : 'Phaser'} rate"
					/>
				</label>
				<label class="block">
					<span class="device-button-label">Depth · {Math.round(piano.phaser.depth * 100)}%</span>
					<input
						class="w-full accent-maximumYellow"
						type="range"
						min="0"
						max="100"
						step="1"
						value={Math.round(piano.phaser.depth * 100)}
						oninput={(e) => piano.setPhaser({ depth: Number(e.currentTarget.value) / 100 })}
						aria-label="{piano.phaser.mode === 'flanger' ? 'Flanger' : 'Phaser'} depth"
					/>
				</label>
			</div>
			<div class="grid grid-cols-1 gap-y-3 content-start">
				<div class="device-button-group-label !text-blue-100/90 !mb-0">Rotary</div>
				<span class="device-button-label !mb-0">Speaker</span>
				<div class="flex gap-2" role="group" aria-label="Rotary speaker">
					<button
						class="flex-1 device-button-xs border {piano.rotary.speed === 'off'
							? 'text-accent'
							: ''}"
						type="button"
						aria-pressed={piano.rotary.speed === "off"}
						title="The rotors stop"
						onclick={() => piano.setRotary("off")}>Off</button
					>
					<button
						class="flex-1 device-button-xs border {piano.rotary.speed === 'slow'
							? 'text-accent'
							: ''}"
						type="button"
						aria-pressed={piano.rotary.speed === "slow"}
						title="A slow swirl, the horn under once a second"
						onclick={() => piano.setRotary("slow")}>Slow</button
					>
					<button
						class="flex-1 device-button-xs border {piano.rotary.speed === 'fast'
							? 'text-accent'
							: ''}"
						type="button"
						aria-pressed={piano.rotary.speed === "fast"}
						title="A fast shimmer, the rotors spun up over a second or two"
						onclick={() => piano.setRotary("fast")}>Fast</button
					>
				</div>
			</div>
			<div class="grid grid-cols-1 gap-y-3 content-start">
				<div class="device-button-group-label !text-blue-100/90 !mb-0">Tone</div>
				<label class="block">
					<span class="device-button-label"
						>Tilt · {piano.tone.tilt === 0
							? "flat"
							: piano.tone.tilt < 0
								? `${Math.round(-piano.tone.tilt * 100)}% dark`
								: `${Math.round(piano.tone.tilt * 100)}% bright`}</span
					>
					<input
						class="w-full accent-maximumYellow"
						type="range"
						min="-100"
						max="100"
						step="1"
						value={Math.round(piano.tone.tilt * 100)}
						oninput={(e) => piano.setTone({ tilt: Number(e.currentTarget.value) / 100 })}
						aria-label="Tone tilt"
					/>
				</label>
				<label class="block">
					<span class="device-button-label">Air · {Math.round(piano.tone.air * 100)}%</span>
					<input
						class="w-full accent-maximumYellow"
						type="range"
						min="0"
						max="100"
						step="1"
						value={Math.round(piano.tone.air * 100)}
						oninput={(e) => piano.setTone({ air: Number(e.currentTarget.value) / 100 })}
						aria-label="Tone air"
					/>
				</label>
				<label class="block">
					<span class="device-button-label">Bottom · {Math.round(piano.tone.bottom * 100)}%</span>
					<input
						class="w-full accent-maximumYellow"
						type="range"
						min="0"
						max="100"
						step="1"
						value={Math.round(piano.tone.bottom * 100)}
						oninput={(e) => piano.setTone({ bottom: Number(e.currentTarget.value) / 100 })}
						aria-label="Tone bottom"
					/>
				</label>
			</div>
		</div>
	{/snippet}

	{#snippet metronomeControls(classes: string)}
		<div class="flex items-stretch gap-1" aria-label="Metronome">
			<button
				class="{classes} {metronome.running ? 'text-accent' : ''}"
				type="button"
				aria-pressed={metronome.running}
				title={metronome.running ? "Stop the metronome" : "Start the metronome"}
				aria-label={metronome.running ? "Stop the metronome" : "Start the metronome"}
				onclick={() => metronome.toggle()}
			>
				<span
					class="i-ph-metronome {metronome.running && metronome.beat === 0
						? 'scale-125'
						: ''} transition-transform"
					aria-hidden="true"
				></span>
			</button>
			<input
				class="{classes} w-14 !px-1 text-center tabular-nums bg-slate-900"
				type="number"
				min={BPM_MIN}
				max={BPM_MAX}
				step="1"
				value={metronome.bpm}
				onchange={(e) => metronome.setBpm(Number(e.currentTarget.value))}
				aria-label="Tempo in beats per minute"
				title="Tempo, in beats per minute"
			/>
			<button
				class="{classes} px-2"
				type="button"
				onclick={() => metronome.tap()}
				title="Tap the tempo"
			>
				Tap
			</button>
		</div>
	{/snippet}

	{#snippet metronomeMenuBlock()}
		<div class="px-3 pt-3 grid grid-cols-1 gap-3 w-full text-blue-100/90">
			{@render metronomeControls("device-button-sm bg-slate-800 border")}
			{#if metronome.running}
				<div class="text-12px opacity-70 tabular-nums">
					beat {metronome.beat + 1} of {metronome.beatsPerBar}
				</div>
			{/if}
		</div>
	{/snippet}

	{#snippet section(title: string, body: Snippet, open = false)}
		<details
			class="group border-t border-current/10 first-of-type-border-t-0"
			name="piano-compact-menu"
			{open}
		>
			<summary
				class="flex items-center justify-between gap-2 px-3 py-2 cursor-pointer select-none text-11px uppercase tracking-wider text-accent list-none [&::-webkit-details-marker]-hidden"
			>
				<span>{title}</span>
				<span
					class="i-ph-caret-down text-14px opacity-70 transition-transform group-open-rotate-180"
					aria-hidden="true"
				></span>
			</summary>
			<div class="pb-3">{@render body()}</div>
		</details>
	{/snippet}

	{#snippet compactMenuBlock()}
		<div class="grid grid-cols-1 -mt-3">
			{#if withMetronome}{@render section("Metronome", metronomeMenuBlock)}{/if}
			{#if sitePresets}{@render section("Presets", presetsPhoneMenuBlock)}{/if}
			{@render section("Volume", volumeSliderMenuBlock, true)}
			{@render section("Effects", fxSlidersMenuBlock)}
			{#if samplesBase !== null || midiSupported}{@render section("More", moreMenuBlock)}{/if}
		</div>
	{/snippet}

	{#snippet moreMenuBlock()}
		{#if samplesBase !== null}{@render hiresButtonMenuBlock()}{/if}
		{#if midiSupported}{@render midiButtonMenuBlock()}{/if}
	{/snippet}

	{#snippet slotButtons(classes: string)}
		{#each SLOT_NUMBERS as n (n)}
			{@const p = slots[n - 1]}
			<button
				class="{classes} {activeSlot === n - 1 ? 'text-accent' : ''} {p ? '' : 'opacity-50'}"
				type="button"
				aria-pressed={activeSlot === n - 1}
				aria-label="Preset {n}{p ? `: ${p.name}` : ' (empty)'}"
				title={p
					? `${p.name} (⌘-click or hold to save here)`
					: `Empty preset ${n}: click to save the sound here`}
				onclick={(e) => slotClick(e, n)}
				onpointerdown={holdStart}
				onpointerup={holdEnd}
				onpointerleave={holdEnd}
				onpointercancel={holdEnd}
				oncontextmenu={(e) => e.preventDefault()}>{n}</button
			>
		{/each}
	{/snippet}

	{#snippet presetsPhoneMenuBlock()}
		<div class="px-3 pt-3 grid grid-cols-1 gap-3 w-full text-blue-100/90">
			<div class="flex gap-1">
				{@render slotButtons("device-button-sm flex-1 bg-slate-800 border")}
			</div>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div onpointerdowncapture={freshSaveForm}>
				<ContextMenu
					ariaLabel="Manage presets"
					title="Save, name, share and manage presets"
					iconClass="i-ph-bookmarks-simple"
					label="Manage presets"
					position="bottom right"
					buttonBaseClasses="device-button-sm bg-slate-800 border px-3"
					popoverClasses="min-w-72 !max-h-[calc(100%-0.5rem)] overflow-y-auto"
					bind:openState={saveOpenPhone}
					items={[
						{ id: "presets-heading-phone", kind: "heading", label: "Presets" },
						{ id: "presets-body-phone", kind: "snippet", snippet: presetsMenuBlock },
					]}
				/>
			</div>
		</div>
	{/snippet}

	{#snippet presetsMenuBlock()}
		<div
			class="px-3 pt-2 grid grid-cols-1 gap-3 text-13px text-blue-100/90 [&_span.device-button-label]-(block mb-1)"
		>
			<!-- save -->
			<form
				class="grid gap-2"
				onsubmit={(e) => {
					e.preventDefault();
					void savePreset();
				}}
			>
				<label class="block">
					<span class="device-button-label">Name</span>
					<input
						class="w-full rounded-md bg-slate-900 border border-current/20 px-2 py-1.5 text-14px"
						type="text"
						maxlength="120"
						placeholder="Warm hall, Chapel organ…"
						bind:value={saveName}
						aria-label="Preset name"
					/>
				</label>
				<div>
					<span class="device-button-label">Slot</span>
					<div class="flex gap-1" role="group" aria-label="Save to slot">
						{#each SLOT_NUMBERS as n (n)}
							<button
								class="device-button-xs w-8 border {saveSlot === n ? 'text-accent' : ''}"
								type="button"
								aria-pressed={saveSlot === n}
								onclick={() => (saveSlot = saveSlot === n ? null : n)}>{n}</button
							>
						{/each}
					</div>
				</div>
				<div class="flex flex-wrap gap-2 items-center">
					<button
						class="device-button-xs px-3 border"
						type="submit"
						disabled={saving || (!account?.canEdit && !saveSlot)}
						title={account?.canEdit
							? "Keep the sound as a preset in the account"
							: "Keep the sound on this slot in this browser"}
						>{account?.canEdit ? "Save" : "Save in this browser"}</button
					>
					{#if presetAdmin}
						<button
							class="device-button-xs px-3 border"
							type="button"
							disabled={saving || !saveSlot}
							title="What every visitor's button holds until they save their own"
							onclick={() => void saveSitePreset()}>Save as site default</button
						>
					{/if}
					<button
						class="device-button-xs px-3 border"
						type="button"
						title="A link that opens the piano with this sound"
						onclick={() => void copyLink()}
					>
						<span class="i-ph-link" aria-hidden="true"></span>
						Copy link
					</button>
				</div>
				{#if !account}
					<div class="text-12px opacity-70">
						{account === null && saveSlot === null
							? "Choose a slot: signed out, presets live on the five buttons in this browser. Sign in to keep more and share them with your band."
							: "Signed out, a preset lives in this browser only. Sign in to keep more and share them with your band."}
					</div>
				{:else if !account.canEdit}
					<div class="text-12px opacity-70">
						Viewers can load the account's presets, not save them.
					</div>
				{/if}
			</form>

			<!-- the slots as they stand -->
			<div>
				<span class="device-button-label">On the buttons</span>
				<ul class="m-0 p-0 list-none grid gap-1">
					{#each SLOT_NUMBERS as n (n)}
						{@const p = slots[n - 1]}
						<li class="flex items-center gap-2">
							<span class="w-5 text-center opacity-70">{n}</span>
							{#if p}
								<button
									class="flex-1 min-w-0 text-left truncate hover-text-accent {activeSlot === n - 1
										? 'text-accent'
										: ''}"
									type="button"
									title="Load this preset"
									onclick={() => loadPreset(p)}>{p.name}</button
								>
								<span class="text-11px opacity-50"
									>{p.source === "site"
										? "site"
										: p.source === "browser"
											? "this browser"
											: ""}</span
								>
								<button
									class="opacity-70 hover-opacity-100 inline-grid place-items-center w-6 h-6 text-14px shrink-0"
									type="button"
									title="Copy a link to this preset"
									aria-label="Copy a link to {p.name}"
									onclick={() => void copyLink(p)}
								>
									<span class="i-ph-link" aria-hidden="true"></span>
								</button>
								{#if p.source === "browser"}
									<button
										class="opacity-70 hover-opacity-100 inline-grid place-items-center w-6 h-6 text-14px shrink-0"
										type="button"
										title="Back to the site's preset"
										aria-label="Clear preset {n} in this browser"
										onclick={() => clearBrowserSlot(n)}
									>
										<span class="i-ph-x" aria-hidden="true"></span>
									</button>
								{:else if p.source === "site" && presetAdmin}
									<button
										class="opacity-70 hover-opacity-100 inline-grid place-items-center w-6 h-6 text-14px shrink-0"
										type="button"
										title="Clear the site's preset"
										aria-label="Clear site preset {n}"
										onclick={() => void clearSitePreset(n)}
									>
										<span class="i-ph-x" aria-hidden="true"></span>
									</button>
								{/if}
							{:else}
								<span class="flex-1 opacity-50">empty</span>
							{/if}
						</li>
					{/each}
				</ul>
			</div>

			<!-- the account's library -->
			{#if account}
				<div>
					<span class="device-button-label">Saved in {account.name} · {saved.length}</span>
					{#if saved.length > 5}
						<input
							class="w-full rounded-md bg-slate-900 border border-current/20 px-2 py-1 text-13px mb-2"
							type="search"
							placeholder="Search presets"
							bind:value={search}
							aria-label="Search presets"
						/>
					{/if}
					<ul class="m-0 p-0 list-none grid gap-1 max-h-60 overflow-y-auto">
						{#each filtered as p (p.id)}
							<li class="flex items-center gap-2">
								<button
									class="flex-1 min-w-0 text-left truncate hover-text-accent {pianoPresetKey(
										p.data,
									) === currentKey
										? 'text-accent'
										: ''}"
									type="button"
									title="Load this preset"
									onclick={() => loadPreset(p)}>{p.name}</button
								>
								{#if account.canEdit}
									<div class="w-14 shrink-0" title="The button this preset sits on">
										<ComboBox
											ariaLabel="Slot for {p.name}"
											buttonClasses="!px-2 !py-0.5 !text-12px w-full"
											options={SLOT_OPTIONS}
											value={p.slot ? String(p.slot) : ""}
											onchange={(v) => void placeSaved(p, v ? Number(v) : null)}
										/>
									</div>
								{:else if p.slot}
									<span class="text-11px opacity-50">slot {p.slot}</span>
								{/if}
								<button
									class="opacity-70 hover-opacity-100 inline-grid place-items-center w-6 h-6 text-14px shrink-0"
									type="button"
									title="Copy a link to this preset"
									aria-label="Copy a link to {p.name}"
									onclick={() => void copyLink(p)}
								>
									<span class="i-ph-link" aria-hidden="true"></span>
								</button>
								{#if account.canEdit}
									<button
										class="opacity-70 hover-opacity-100 inline-grid place-items-center w-6 h-6 text-14px shrink-0"
										type="button"
										title="Rename"
										aria-label="Rename {p.name}"
										onclick={() => void renameSaved(p)}
									>
										<span class="i-ph-pencil-simple" aria-hidden="true"></span>
									</button>
									<button
										class="opacity-70 hover-opacity-100 inline-grid place-items-center w-6 h-6 text-14px shrink-0"
										type="button"
										title="Delete"
										aria-label="Delete {p.name}"
										onclick={() => void deleteSaved(p)}
									>
										<span class="i-ph-trash" aria-hidden="true"></span>
									</button>
								{/if}
							</li>
						{:else}
							<li class="opacity-60">{search ? "No preset matches" : "No presets saved yet"}</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>
	{/snippet}

	{#snippet volumeSlider()}
		<input
			class="w-full accent-maximumYellow"
			type="range"
			min="0"
			max="100"
			step="1"
			value={Math.round(piano.volume * 100)}
			oninput={(e) => piano.setVolume(Number(e.currentTarget.value) / 100)}
			aria-label="Volume"
		/>
	{/snippet}

	{#snippet volumeSliderMenuBlock()}
		<div class="px-3 pt-3 [&_span]-(block mb-2 text-blue-100/90) grid grid-cols-1 gap-y-2 mb-4">
			<label class="block">
				<span class="device-button-label">Volume · {Math.round(piano.volume * 100)}%</span>
				{@render volumeSlider()}
			</label>
		</div>
	{/snippet}

	{#snippet keyControls(compact: boolean)}
		<div class={compact ? "grid gap-2" : "flex items-end gap-2"}>
			<div class={compact ? "" : "w-8"}>
				<div class="device-button-group-label sr-only">Key</div>
				{#snippet keySelectorMenuBlock()}
					<div
						class="grid grid-cols-1 gap-y-3 px-3 min-w-200px pt-3 pb-8 text-blue-100/90 text-14px"
					>
						<div>
							<span class="block mb-2">Select a Key</span>
							<ComboBox
								ariaLabel="Key"
								clearDefaultButtonClasses={true}
								buttonClasses="w-full @4xl-device-button-xs !@4xl-text-slate-400 @4xl-hover-bg-slate-900 border"
								popoverClasses="text-blue-100 [&_li]-bg-blue-100/10 min-w-auto"
								options={[{ value: "none", label: "None" }, ...ROOT_OPTIONS]}
								value={piano.key ? String(piano.key.root) : "none"}
								onchange={(v) => (v === "none" ? piano.setKey(null) : setKeyRoot(Number(v)))}
							/>
						</div>
						{#if piano.key}
							<div class={compact ? "" : "w-full"}>
								<span class="block mb-2">Scale</span>
								<ComboBox
									ariaLabel="Scale"
									clearDefaultButtonClasses={true}
									buttonClasses="w-full @4xl-device-button-xs @4xl-hover-bg-slate-900 border"
									popoverClasses="text-blue-100 [&_li]-bg-blue-100/10 min-w-auto"
									options={MODE_OPTIONS}
									value={piano.key.mode}
									onchange={(v) => setKeyMode(v as ScaleModeId)}
								/>
							</div>
							<div>
								<span class="block mb-2">Show Numbers</span>
								<button
									class="w-full @4xl-device-button-xs px-3 @4xl-hover-bg-slate-900 border {piano.degrees
										? 'text-accent'
										: ''}"
									type="button"
									aria-pressed={piano.degrees}
									title="Number the keys by their degree in the key"
									onclick={() => piano.setDegrees(!piano.degrees)}>1–7</button
								>
							</div>
							<hr class="border-current/10" />
							<div class={compact ? "" : "w-full"}>
								<span class="block mb-2">Toggle Guides</span>
								<button
									class="w-full @4xl-device-button-xs px-3 @4xl-hover-bg-slate-900 border"
									onclick={() => {
										piano.setDegrees(false);
										piano.setKey(null);
									}}
								>
									Turn Off All Guides
								</button>
							</div>
						{/if}
					</div>
				{/snippet}
				<ContextMenu
					ariaLabel="Key Selector"
					title="Select Key and Scale to show Guides"
					position="bottom left"
					buttonClasses="device-button-xs bg-slate-800 !flex text-13px w-8 !p-0"
					iconClass="i-ph-scales-fill"
					label=""
					items={[
						{ kind: "heading", label: "Show Scales" },
						{ id: "key-menu-block", kind: "snippet", snippet: keySelectorMenuBlock },
					]}
				/>
			</div>
		</div>
	{/snippet}

	{#snippet midiButton(buttonClasses?: string)}
		{#if piano.midi.status === "on"}
			<button
				class="text-accent {buttonClasses}"
				type="button"
				title={piano.midi.inputs.length
					? `Listening to ${piano.midi.inputs.join(", ")}`
					: "Listening; plug a controller in"}
				onclick={() => piano.disconnectMidi()}
			>
				<span class="i-ph-usb" aria-hidden="true"></span>
				<span class="@4xl-sr-only">{piano.midi.inputs.length ? "Connected" : "No controller"}</span>
			</button>
		{:else}
			<button
				class={buttonClasses}
				type="button"
				title="Play from a MIDI keyboard or pad (the browser asks once)"
				onclick={() => void piano.connectMidi()}
			>
				<span class="i-ph-usb" aria-hidden="true"></span>
				<span class="@4xl-sr-only">{piano.midi.status === "denied" ? "MIDI refused" : "MIDI"}</span>
			</button>
		{/if}
	{/snippet}

	{#snippet midiButtonMenuBlock()}
		<div class="px-3 pt-3 grid grid-cols-1 w-full text-blue-100/90">
			{@render midiButton("device-button-sm bg-slate-800 border")}
		</div>
	{/snippet}

	<!-- branding, as the other devices wear it -->
	<div
		class="absolute bottom-3 right-5 text-12px uppercase font-sans text-oxford text-shadow opacity-90 font-600 select-none pointer-events-none"
	>
		SS Keys 001
	</div>
</div>
