<script lang="ts">
	import ComboBox from "$lib/components/ComboBox.svelte";
	import ContextMenu from "$lib/components/ContextMenu.svelte";
	import { piano } from "$lib/audio/piano.svelte";
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
	import { onDestroy, onMount } from "svelte";
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
	}
	let { keyboard = true, warm = false, samplesBase = null }: Props = $props();

	let hiresCached = $state(false);
	onMount(() => {
		piano.samplesBase = samplesBase;
		piano.load(warm);
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
</script>

<svelte:window {onkeydown} {onkeyup} {onblur} />

{#snippet keyControls(compact: boolean)}
	<div class={compact ? "grid gap-2" : "flex items-end gap-2"}>
		<div class={compact ? "" : "w-20"}>
			<div class="device-button-group-label">Key</div>
			<ComboBox
				ariaLabel="Key"
				buttonClasses="lt-sm-h-28px lt-sm-!py-0 lt-sm-!px-3 lt-sm-!text-13px"
				options={[{ value: "none", label: "None" }, ...ROOT_OPTIONS]}
				value={piano.key ? String(piano.key.root) : "none"}
				onchange={(v) => (v === "none" ? piano.setKey(null) : setKeyRoot(Number(v)))}
			/>
		</div>
		{#if piano.key}
			<div class={compact ? "" : "w-40"}>
				<ComboBox
					ariaLabel="Scale"
					buttonClasses="lt-sm-h-28px lt-sm-!py-0 lt-sm-!px-3 lt-sm-!text-13px"
					options={MODE_OPTIONS}
					value={piano.key.mode}
					onchange={(v) => setKeyMode(v as ScaleModeId)}
				/>
			</div>
			<button
				class="device-button-sm px-3 {piano.degrees ? 'text-accent' : ''}"
				type="button"
				aria-pressed={piano.degrees}
				title="Number the keys by their degree in the key"
				onclick={() => piano.setDegrees(!piano.degrees)}>1–7</button
			>
		{/if}
	</div>
{/snippet}

<div
	class="device-chrome grid gap-4 px-3 py-4 sm-px-5 sm-pt-5 pb-12 w-full max-w-full relative"
	aria-label="Piano"
>
	<!-- the screen -->
	<div
		class="device-screen flex flex-wrap items-end justify-between gap-x-6 gap-y-2 px-4 py-3 transition-opacity {piano.on
			? ''
			: '[&>*]-(opacity-25)'}"
	>
		<div>
			<div class="text-24px sm-text-32px leading-none">{instrumentLabel(piano.instrument)}</div>
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
			</div>
		</div>
		<div
			class="text-12px opacity-70 rounded border border-current/40 px-2 py-1 min-w-24 text-center"
			aria-live="polite"
		>
			{readout}
		</div>
	</div>

	<!-- the power switch, full width on a phone: it opens the audio before the first note, which would otherwise be late on iOS -->
	<button
		class="sm-hidden device-button-sm w-full text-15px {piano.on ? 'text-accent' : ''}"
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
		{piano.on ? "On" : piano.starting ? "Starting…" : "Off"}
	</button>

	<!-- the controls -->
	<div class="flex flex-wrap items-end gap-x-2 sm-gap-x-5 gap-y-3">
		<div class="hidden sm-block">
			<div class="device-button-group-label">Power</div>
			<button
				class="device-button-sm px-3 {piano.on ? 'text-accent' : ''}"
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
				{piano.on ? "On" : "Off"}
			</button>
		</div>
		<div class="flex-1 min-w-28 sm-flex-none sm-w-44">
			<div class="device-button-group-label">Sound</div>
			<ComboBox
				ariaLabel="Sound"
				buttonClasses="lt-sm-h-28px lt-sm-!py-0 lt-sm-!px-3 lt-sm-!text-13px"
				options={INSTRUMENT_OPTIONS}
				value={piano.instrument}
				onchange={(v) => piano.setInstrument(v as PianoInstrumentId)}
			/>
		</div>
		<div>
			<div class="device-button-group-label">Octave</div>
			<div class="flex items-center gap-1" role="group" aria-label="Octave">
				<button
					class="device-button-xs sm-device-button-sm px-2 sm-px-3"
					type="button"
					disabled={piano.octave <= PIANO_OCTAVE_MIN}
					aria-label="Octave down"
					title="Octave down (arrow down)"
					onclick={() => piano.setOctave(piano.octave - 1)}>−</button
				>
				<span class="min-w-7 sm-min-w-10 text-center text-14px tabular-nums text-oxford font-600"
					>C{piano.octave}</span
				>
				<button
					class="device-button-xs sm-device-button-sm px-2 sm-px-3"
					type="button"
					disabled={piano.octave >= PIANO_OCTAVE_MAX}
					aria-label="Octave up"
					title="Octave up (arrow up)"
					onclick={() => piano.setOctave(piano.octave + 1)}>+</button
				>
				<!-- A very small toggle: the computer-key letters on the keys, on or off. -->
				<button
					class="device-button-xs !min-w-auto px-1.5 ml-1 {piano.labels
						? 'text-accent'
						: 'opacity-60'}"
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
		</div>
		<!-- the pedal has no place on a phone (the space bar is its key); the levels and MIDI go into a menu there -->
		<div class="hidden sm-block">
			{@render keyControls(false)}
		</div>
		<div class="hidden sm-block">
			<div class="device-button-group-label">Pedal</div>
			<button
				class="device-button-sm px-3 {piano.sustain ? 'text-accent' : ''}"
				type="button"
				aria-pressed={piano.sustain}
				title="Sustain: notes ring on after you let go (hold the space bar)"
				onclick={() => piano.setSustain(!piano.sustain)}
			>
				<span class="i-ph-waves" aria-hidden="true"></span>
				Sustain
			</button>
		</div>
		<div class="hidden sm-flex flex-wrap items-end gap-x-5 gap-y-3">
			<label class="block w-36">
				<span class="device-button-label">Volume · {Math.round(piano.volume * 100)}%</span>
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
			</label>
			<label class="block w-36">
				<span class="device-button-label">Reverb · {Math.round(piano.reverb * 100)}%</span>
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
			{#if samplesBase}
				<div>
					<div class="device-button-group-label">Samples</div>
					{@render hiresButton("device-button-sm px-3")}
				</div>
			{/if}
			{#if midiSupported}
				<div>
					<div class="device-button-group-label">MIDI</div>
					{#if piano.midi.status === "on"}
						<button
							class="device-button-sm px-3 text-accent"
							type="button"
							title={piano.midi.inputs.length
								? `Listening to ${piano.midi.inputs.join(", ")}`
								: "Listening; plug a controller in"}
							onclick={() => piano.disconnectMidi()}
						>
							<span class="i-ph-usb" aria-hidden="true"></span>
							{piano.midi.inputs.length ? "Connected" : "No controller"}
						</button>
					{:else}
						<button
							class="device-button-sm px-3"
							type="button"
							title="Play from a MIDI keyboard or pad (the browser asks once)"
							onclick={() => void piano.connectMidi()}
						>
							<span class="i-ph-usb" aria-hidden="true"></span>
							{piano.midi.status === "denied" ? "MIDI refused" : "Connect MIDI"}
						</button>
					{/if}
				</div>
			{/if}
		</div>
		<div class="sm-hidden">
			<ContextMenu
				ariaLabel="Levels and MIDI"
				title="Volume, reverb and MIDI"
				iconClass="i-ph-sliders-horizontal"
				position="bottom left"
				buttonBaseClasses="device-button-xs px-2"
				popoverClasses="min-w-64"
				items={[{ id: "piano-levels", kind: "snippet", snippet: levelsItem }]}
			/>
		</div>
	</div>

	<!-- the keys -->
	<div
		class="relative w-full select-none touch-none rounded-md overflow-hidden {vertical
			? 'h-[78vh] min-h-560px'
			: 'h-160px sm-h-200px'}"
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
							? 'bg-accent'
							: on
								? 'bg-oxford/50'
								: key.black
									? 'bg-slate-400'
									: 'bg-slate-400'}"
						aria-hidden="true"
					></span>
				{/if}
				{#if vertical}
					{#if key.midi % 12 === 0}<span class="text-10px">{noteLabel(key.midi)}</span>{/if}
					{#if degree !== null}<span class="opacity-70">{degree}</span>{/if}
				{:else}
					<!-- Two fixed rows on every key, so the letters line up: the octave name (on the Cs) above, the letter or degree below. -->
					<span class="block h-3 text-10px leading-3"
						>{key.midi % 12 === 0 ? noteLabel(key.midi) : ""}</span
					>
					<span class="block h-4 leading-4 opacity-70"
						>{degree !== null ? degree : piano.labels ? key.label : ""}</span
					>
				{/if}
			</button>
		{/each}
	</div>

	{#snippet hiresButton(classes: string)}
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
			{hiresState === "on"
				? "Hi-res"
				: hiresState === "loading"
					? `Hi-res ${percent(piano.loadingTiers.hires)}`
					: hiresCached
						? "Hi-res"
						: `Hi-res · ${mb(hiresBytes)}`}
		</button>
	{/snippet}

	{#snippet levelsItem()}
		<div class="grid gap-3 px-3 py-2 text-13px [&_.device-button-label]-(text-current opacity-80)">
			<div class="text-blue-100/80">{@render keyControls(true)}</div>
			<label class="block">
				<span class="device-button-label">Volume · {Math.round(piano.volume * 100)}%</span>
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
			</label>
			<label class="block">
				<span class="device-button-label">Reverb · {Math.round(piano.reverb * 100)}%</span>
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
			{#if samplesBase}
				{@render hiresButton("device-button-xs px-3 justify-self-start")}
			{/if}
			{#if midiSupported}
				<button
					class="device-button-xs px-3 justify-self-start {piano.midi.status === 'on'
						? 'text-accent'
						: ''}"
					type="button"
					onclick={() =>
						piano.midi.status === "on" ? piano.disconnectMidi() : void piano.connectMidi()}
				>
					<span class="i-ph-usb" aria-hidden="true"></span>
					{piano.midi.status === "on"
						? piano.midi.inputs.length
							? "MIDI connected"
							: "MIDI: no controller"
						: piano.midi.status === "denied"
							? "MIDI refused"
							: "Connect MIDI"}
				</button>
			{/if}
		</div>
	{/snippet}

	<!-- branding, as the other devices wear it -->
	<div
		class="absolute bottom-3 right-5 text-12px uppercase font-sans text-oxford text-shadow opacity-90 font-600 select-none pointer-events-none"
	>
		SS Keys 001
	</div>
</div>
