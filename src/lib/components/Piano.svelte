<script lang="ts">
	import ComboBox from "$lib/components/ComboBox.svelte";
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
	}
	let { keyboard = true }: Props = $props();

	onMount(() => piano.load());
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
	class="device-chrome grid gap-4 px-3 py-4 sm-px-5 sm-pt-5 pb-12 w-full max-w-full relative"
	aria-label="Piano"
>
	<!-- the screen -->
	<div class="device-screen flex flex-wrap items-end justify-between gap-x-6 gap-y-2 px-4 py-3">
		<div>
			<div class="text-24px sm-text-32px leading-none">{instrumentLabel(piano.instrument)}</div>
			<div class="mt-2 text-12px opacity-70 flex flex-wrap gap-x-2">
				<span>{noteLabel(piano.base)} to {noteLabel(top)}</span>
				<span>· {piano.sustain ? "sustain" : "no sustain"}</span>
				{#if piano.midi.status === "on"}
					<span>· MIDI: {piano.midi.inputs.join(", ") || "no inputs"}</span>
				{/if}
			</div>
		</div>
		<div
			class="text-12px opacity-70 rounded border border-current/40 px-2 py-1 min-w-24 text-center"
			aria-live="polite"
		>
			{piano.sounding.length ? piano.sounding.map(noteLabel).join(" ") : "silent"}
		</div>
	</div>

	<!-- the controls -->
	<div class="flex flex-wrap items-end gap-x-5 gap-y-3">
		<div class="w-44">
			<div class="device-button-group-label">Sound</div>
			<ComboBox
				ariaLabel="Sound"
				options={INSTRUMENT_OPTIONS}
				value={piano.instrument}
				onchange={(v) => piano.setInstrument(v as PianoInstrumentId)}
			/>
		</div>
		<div>
			<div class="device-button-group-label">Octave</div>
			<div class="flex items-center gap-1" role="group" aria-label="Octave">
				<button
					class="device-button-sm px-3"
					type="button"
					disabled={piano.octave <= PIANO_OCTAVE_MIN}
					aria-label="Octave down"
					title="Octave down (arrow down)"
					onclick={() => piano.setOctave(piano.octave - 1)}>−</button
				>
				<span class="min-w-10 text-center text-14px tabular-nums text-oxford font-600"
					>C{piano.octave}</span
				>
				<button
					class="device-button-sm px-3"
					type="button"
					disabled={piano.octave >= PIANO_OCTAVE_MAX}
					aria-label="Octave up"
					title="Octave up (arrow up)"
					onclick={() => piano.setOctave(piano.octave + 1)}>+</button
				>
			</div>
		</div>
		<div>
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
			<button
				class="absolute flex items-center border border-oxford-950/60 text-11px font-500 transition-colors duration-75 {vertical
					? 'left-0 flex-row justify-end pr-3 gap-2'
					: 'top-0 flex-col justify-end pb-2'} {key.black
					? `z-10 ${vertical ? 'w-62% rounded-r' : 'h-60% rounded-b'} ${on ? 'bg-accent text-oxford' : 'bg-slate-900 text-slate-300 hover-bg-slate-800'}`
					: `${vertical ? 'w-full rounded-r-md' : 'h-full rounded-b-md'} ${on ? 'bg-accent text-oxford' : 'bg-slate-100 text-slate-500 hover-bg-white'}`}"
				style={vertical
					? `top: ${100 - key.left - key.width}%; height: ${key.width}%`
					: `left: ${key.left}%; width: ${key.width}%`}
				type="button"
				data-note={key.midi}
				aria-label={noteLabel(key.midi)}
				aria-pressed={on}
				tabindex="-1"
			>
				{#if key.label}<span class="opacity-70">{key.label}</span>{/if}
				{#if key.midi % 12 === 0}<span class="text-10px">{noteLabel(key.midi)}</span>{/if}
			</button>
		{/each}
	</div>

	<!-- branding, as the other devices wear it -->
	<div
		class="absolute bottom-3 right-5 text-12px uppercase font-sans text-oxford text-shadow opacity-90 font-600 select-none pointer-events-none"
	>
		SS Keys 001
	</div>
</div>
