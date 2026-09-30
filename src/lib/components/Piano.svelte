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
	/** The Effects button lights while any effect is up. */
	let fxOn = $derived(
		piano.reverb > 0 ||
			piano.delay.level > 0 ||
			piano.chorus.mix > 0 ||
			piano.tremolo.depth > 0 ||
			piano.fuzz.drive > 0 ||
			piano.phaser.mix > 0 ||
			piano.rotary.speed !== "off",
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
</script>

<svelte:window {onkeydown} {onkeyup} {onblur} />

<div
	class="
		device-chrome
		gap-3
		grid
		pb-12
		px-3
		py-4
		sm-gap-x-4
		sm-gap-y-4
		sm-pr-5
		sm-pl-10
		md-px-5
		sm-pt-5

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

	<div class="grid grid-cols-1 gap-x-3 gap-y-4 sm-flex">
		<!-- the controls -->
		<div
			class="
				gap-2
			 	w-full
				grid
				grid-cols-[auto_1fr_auto_auto]
				place-content-start
				md-grid-cols-[auto_auto_auto_auto_1fr]
				lg-grid-cols-[auto_auto_auto_auto_auto_auto_1fr]
				md-gap-3"
		>
			<!-- power -->
			<div class="">
				<div class="hidden lg-block device-button-group-label text-dark lg-max-w-fit">Power</div>
				<!-- on / off -->
				<button
					class="device-button-sm lg-device-button-xs px-3 text-15px lg-text-14px {piano.on
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
					<span class="hidden sm-inline-block lg-hidden">{piano.on ? "On" : "Off"}</span>
				</button>
			</div>

			<!-- instrument voice -->
			<div class="min-w-28 flex-none md-text-14px">
				<div class="device-button-group-label text-dark hidden lg-block">Sound</div>
				<ComboBox
					ariaLabel="Sound"
					clearDefaultButtonClasses={true}
					popoverClasses="text-15px"
					buttonClasses="device-button-sm lg-device-button-xs px-3 text-15px lg-text-14px w-full"
					options={INSTRUMENT_OPTIONS}
					value={piano.instrument}
					onchange={(v) => piano.setInstrument(v as PianoInstrumentId)}
				/>
			</div>

			<!-- octave selector -->
			<div class="text-14px">
				<div class="device-button-group-label text-dark hidden lg-block">Octave</div>
				<div class="flex items-center gap-1 md-gap-2 lg-gap-1" role="group" aria-label="Octave">
					<button
						class="min-w-10 device-button-sm lg-device-button-xs lg-min-w-8 px-2 sm-px-3"
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
							lg-h-28px
							lg-min-w-9
							lg-text-14px
							{piano.on ? 'text-blue-100/90' : 'text-blue-100/20'} font-500">C{piano.octave}</span
					>
					<button
						class="min-w-10 device-button-sm px-2 sm-px-3 lg-min-w-8 lg-device-button-xs"
						type="button"
						disabled={piano.octave >= PIANO_OCTAVE_MAX}
						aria-label="Octave up"
						title="Octave up (arrow up)"
						onclick={() => piano.setOctave(piano.octave + 1)}>+</button
					>
				</div>
			</div>

			<!-- key selector -->
			<!-- <div class="hidden lg-block [&_.device-button-group-label]-text-dark">
				{@render keyControls(false)}
			</div> -->

			<!-- effects button -->
			<div class="hidden lg-block">
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
					popoverClasses="min-w-72 lg-min-w-160 !max-h-85vh overflow-y-auto"
					items={[
						{ id: "effect-menu-heading", kind: "heading", label: "Effects" },
						{ id: "piano-fx", kind: "snippet", snippet: fxSlidersMenuBlock },
					]}
				/>
			</div>

			<!-- controls block -->
			<div
				class="hidden lg-grid grid-cols-[32px_32px_32px_32px_32px] lg-gap-x-1 items-end place-content-start"
			>
				<!-- label -->
				<div class="device-button-group-label text-dark col-span-full">More</div>

				<!-- sustain pedal -->
				<div class="hidden lg-block lg-32px">
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
					<div class="hidden lg-block lg-32px">
						<div class="device-button-group-label text-dark lg-sr-only">MIDI</div>
						{@render midiButton("device-button-xs")}
					</div>
				{/if}

				<!-- hi-res -->
				{#if samplesBase}
					<div class="hidden lg-block">
						<div class="device-button-group-label text-dark sr-only">Samples</div>
						{@render hiresButton("device-button-xs px-1 lg-w-8")}
					</div>
				{/if}

				<div class="hidden lg-block">
					{@render keyControls(false)}
				</div>

				<!-- Toggle computer key letter labels on piano keys -->
				<div class="hidden lg-block">
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
			</div>

			<!-- context menu -->
			<div>
				<ContextMenu
					ariaLabel="Levels and MIDI"
					title="Volume, reverb and MIDI"
					iconClass="i-ph-sliders-horizontal"
					position="bottom left"
					buttonBaseClasses="device-button-sm px-2 w-10 lg-hidden lg-w-8"
					popoverClasses="min-w-64 min-h-560px overflow-y-scroll pb-8"
					items={[
						{ id: "menu-volume-heading", kind: "heading", label: "volume" },
						{ id: "menu-volume-slider", kind: "snippet", snippet: volumeSliderMenuBlock },
						{ id: "menu-fx-heading", kind: "heading", label: "Effects" },
						{ id: "menu-effects-sliders", kind: "snippet", snippet: fxSlidersMenuBlock },
						{ id: "other-heading", kind: "heading", label: "More" },
						{
							id: "menu-hi-res-button",
							kind: "snippet",
							condition: samplesBase !== null,
							snippet: hiresButtonMenuBlock,
						},
						{
							id: "menu-midi-button",
							kind: "snippet",
							condition: midiSupported,
							snippet: midiButtonMenuBlock,
						},
					]}
				/>
			</div>

			<!-- volume -->
			<label
				class="
					hidden
					w-36
					md-block
					md-ml-auto
					lg-grid
					lg-grid-cols-1
					lg-grid-rows-[auto_28px]
					lg-h-57.25px
					lg-max-w-280px
					lg-w-auto"
			>
				<span
					class="
					lg-device-button-group-label
					hidden
					text-dark
					text-14px
					text-blue-100/90
					w-full
					md-block">Volume</span
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
			<span class="lg-sr-only"
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
			class="px-3 pt-3 [&_span]-(block mb-2 text-blue-100/90) grid grid-cols-1 sm-grid-cols-2 lg-grid-cols-3 gap-x-6 gap-y-4 mb-4"
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
				<div class="device-button-group-label !text-blue-100/90 !mb-0">Phaser</div>
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
						aria-label="Phaser mix"
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
						aria-label="Phaser rate"
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
						aria-label="Phaser depth"
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
			<div class={compact ? "" : "w-20"}>
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
								buttonClasses="w-full lg-device-button-xs !lg-slate-400 lg-hover-bg-slate-900 border"
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
									buttonClasses="w-full lg-device-button-xs lg-hover-bg-slate-900 border"
									popoverClasses="text-blue-100 [&_li]-bg-blue-100/10 min-w-auto"
									options={MODE_OPTIONS}
									value={piano.key.mode}
									onchange={(v) => setKeyMode(v as ScaleModeId)}
								/>
							</div>
							<div>
								<span class="block mb-2">Show Numbers</span>
								<button
									class="w-full lg-device-button-xs px-3 lg-hover-bg-slate-900 border {piano.degrees
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
									class="w-full lg-device-button-xs px-3 lg-hover-bg-slate-900 border"
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
				<span class="lg-sr-only">{piano.midi.inputs.length ? "Connected" : "No controller"}</span>
			</button>
		{:else}
			<button
				class={buttonClasses}
				type="button"
				title="Play from a MIDI keyboard or pad (the browser asks once)"
				onclick={() => void piano.connectMidi()}
			>
				<span class="i-ph-usb" aria-hidden="true"></span>
				<span class="lg-sr-only">{piano.midi.status === "denied" ? "MIDI refused" : "MIDI"}</span>
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
