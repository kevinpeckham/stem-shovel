<script lang="ts">
	import type { StemEngine } from "$lib/audio/engine.svelte";
	import { type BarGrid, formatPosition } from "$lib/audio/measures";
	import { cycleReadoutMode, readoutMode } from "$lib/audio/readout.svelte";
	import { POSITION_MODE_LABELS, type PositionMode } from "$lib/constants/positionModes";
	import { isTextEntry } from "$lib/utils/isTextEntry";
	import { type SongChange } from "$lib/val/SongChangeSchema";

	interface Props {
		engine: StemEngine;
		/** When the song has a tempo and a meter, the readout can show bars instead of time. */
		grid?: BarGrid | null;
		/** Song end for the total (null = the last stem). */
		endAt?: number | null;
		/** Frame rate for the timecode readout. */
		fps?: number;
		changes?: SongChange[];
	}

	let { engine, grid = null, endAt = null, fps = 25, changes = [] }: Props = $props();

	// The readout format is shared with tooltips and the settings rows ($lib/audio/readout).
	let ctx = $derived({ fps, grid });
	let mode = $derived(readoutMode(!!grid));
	let now = $derived(formatPosition(mode, engine.position, ctx));
	let total = $derived(formatPosition(mode, endAt ?? engine.duration, ctx));
	// The other mode, when the song can count bars; timecode alone otherwise.
	let nextMode = $derived(
		POSITION_MODE_LABELS[(grid && mode === "timecode" ? "bars" : "timecode") as PositionMode],
	);

	// The tempo, key and meter in force at the playhead (the last change at or
	// before it; the first change when the playhead is ahead of them all).
	const inForce = (kind: SongChange["kind"]) => {
		const of = changes.filter((c) => c.kind === kind);
		return of.findLast((c) => engine.position >= c.start) ?? of[0];
	};
	let key = $derived(inForce("key")?.value ?? "");
	let tempo = $derived(inForce("tempo") ? `${inForce("tempo")?.value} bpm` : "");
	let meter = $derived(inForce("meter")?.value ?? "");

	// Space toggles, Home rewinds, from anywhere except text entry (see $lib/keys).
	// A focused button therefore does NOT activate on Space (Enter still does, and
	// M / S remain the row shortcuts); preventing the keydown default is what
	// stops the browser from firing the button's click on keyup.
	function onwindowkeydown(e: KeyboardEvent): void {
		if (e.metaKey || e.ctrlKey || e.altKey || isTextEntry(e.target)) return;
		if (e.key === " ") {
			e.preventDefault();
			if (!e.repeat) engine.toggle();
		} else if (e.key === "Home") {
			e.preventDefault();
			engine.seek(0);
		}
	}

	/** Belt and braces: some browsers activate buttons on Space keyup. */
	function onwindowkeyup(e: KeyboardEvent): void {
		if (e.key === " " && !isTextEntry(e.target)) e.preventDefault();
	}
</script>

<svelte:window onkeydown={onwindowkeydown} onkeyup={onwindowkeyup} />

<div class="flex flex-wrap items-center gap-4">
	<button
		type="button"
		class="grid h-10 w-10 place-items-center rounded-lg border border-white/15 bg-white/5 text-neutral-100 transition-all hover-bg-white/10 hover-text-accent active:scale-95 disabled:(opacity-40 cursor-wait)"
		aria-label="Go to beginning"
		title="Go to beginning (Home)"
		disabled={engine.status !== "ready"}
		onclick={() => engine.seek(0)}
	>
		<span class="i-ph-skip-back-fill text-20px" aria-hidden="true"></span>
	</button>
	<button
		type="button"
		class="grid h-10 w-10 place-items-center rounded-lg bg-maximumYellow text-oxford transition-all hover:shadow-lg hover:shadow-maximumYellow/30 active:scale-95 disabled:(opacity-40 cursor-wait)"
		aria-label={engine.playing ? "Pause" : "Play"}
		title={engine.status === "ready" ? undefined : "Decoding…"}
		disabled={engine.status !== "ready"}
		onclick={() => engine.toggle()}
	>
		<span
			class="{engine.playing ? 'i-ph-pause-fill' : 'i-ph-play-fill'} text-24px"
			aria-hidden="true"
		></span>
	</button>

	<div class="bg-black/40 px-3 py-2 rounded-md leading-none flex gap-4">
		<!-- position readout -->
		<button
			type="button"
			class="cursor-pointer text-left tabular-nums hover-text-accent h-auto text-28px"
			title="{POSITION_MODE_LABELS[mode]} — click for {nextMode}{grid
				? ''
				: ' (bars need a tempo and a time signature in song settings)'}"
			aria-label="Readout format: {POSITION_MODE_LABELS[mode]}"
			onclick={() => cycleReadoutMode(!!grid)}
		>
			{now}
			<!-- <span class="opacity-60 text-12px">{total}</span> -->
		</button>

		<!-- metadata -->
		<div class="opacity-85 text-12px grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
			<div class="col-span-2">{key}</div>
			<div>{tempo}</div>
			<div>{meter}</div>
		</div>
	</div>

	<label class="ml-auto flex items-center gap-2 text-sm text-dim">
		Master
		<input
			type="range"
			class="w-32 accent-blue-300"
			min="0"
			max="1"
			step="0.01"
			value={engine.master}
			oninput={(e) => engine.setMaster(e.currentTarget.valueAsNumber)}
		/>
	</label>
</div>
