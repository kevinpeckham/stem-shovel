<script lang="ts">
	import { drumMachine } from "$lib/audio/drumMachine.svelte";
	import { metronome } from "$lib/audio/metronome.svelte";
	import ContextMenu from "$lib/components/ContextMenu.svelte";
	import {
		DRUM_BPM_MAX,
		DRUM_BPM_MIN,
		DRUM_KITS,
		DRUM_STEP_CHOICES,
		DRUM_VOICES,
		MAX_DRUM_PATTERNS,
		MAX_DRUM_ROWS,
		type DrumVoiceId,
	} from "$lib/constants/drumMachine";
	import { notify } from "$lib/state/notifications.svelte";
	import { errorMessage } from "$lib/utils/errorMessage";
	import { onMount } from "svelte";

	/**
	 * The drum machine as a device (docs/drum-machine.md): a readout, the
	 * transport and tempo, the pattern tabs, the grid of rows and steps, and
	 * the row controls; or, compact, a toggle with the tempo for a device's
	 * control row or a menu, like the metronome's. A view of the page's one
	 * engine (src/lib/audio/drumMachine.svelte.ts). On a phone a bar shows as
	 * two lines of eight, so every cell stays big enough to tap; the level
	 * and pan sliders show from sm up. The drums and the metronome never
	 * play together: starting one stops the other and takes its tempo.
	 */
	interface Props {
		compact?: boolean;
		/** Compact only: when the tempo field shows. "auto" is while running. */
		tempo?: "auto" | "always" | "never";
		/** Compact only: the toggle shows the icon, or the words On / Off (for a menu row that names it already). */
		toggle?: "icon" | "text";
		/** Space plays and stops. Off where the page needs space for scrolling (the home page demo). */
		keyboard?: boolean;
	}
	let { compact = false, tempo = "auto", toggle = "icon", keyboard = true }: Props = $props();
	let showTempo = $derived(tempo === "always" || (tempo === "auto" && drumMachine.running));

	// The full view is about the drums: fetch the sampled kit as it opens. A toolbar's toggle waits for the first play.
	onMount(() => drumMachine.load(!compact));

	const voiceLabel = (id: DrumVoiceId) => DRUM_VOICES.find((v) => v.id === id)?.label ?? id;
	const kitLabel = (id: string) => DRUM_KITS.find((k) => k.id === id)?.label ?? id;

	function togglePlay() {
		if (!drumMachine.running && metronome.running) {
			drumMachine.setBpm(metronome.bpm);
			metronome.stop();
		}
		drumMachine.toggle();
	}

	// Painting: press a cell and drag across others to set them all the same way.
	// A long press (or a right click, or shift) on a sounding cell steps its velocity instead.
	const LONG_PRESS_MS = 450;
	let painting = $state<boolean | null>(null);
	let pressTimer: ReturnType<typeof setTimeout> | null = null;
	function paintAt(x: number, y: number) {
		if (painting === null) return;
		const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-row][data-step]");
		if (!el) return;
		drumMachine.setCell(Number(el.dataset.row), Number(el.dataset.step), painting);
	}
	function press(e: PointerEvent, row: number, step: number, velocity: number) {
		if (e.button !== 0) return;
		if (e.shiftKey && velocity) {
			drumMachine.cycleVelocity(row, step);
			return;
		}
		painting = !velocity;
		drumMachine.setCell(row, step, painting);
		if (velocity) {
			// Held: the cell comes back at its next velocity and the paint is off.
			pressTimer = setTimeout(() => {
				painting = null;
				drumMachine.setVelocity(row, step, (velocity % 3) + 1);
			}, LONG_PRESS_MS);
		}
	}
	function release() {
		painting = null;
		if (pressTimer) clearTimeout(pressTimer);
		pressTimer = null;
	}

	function onkeydown(e: KeyboardEvent) {
		const t = e.target as HTMLElement | null;
		if (
			compact ||
			!keyboard ||
			e.key !== " " ||
			t?.closest("input, select, textarea, [contenteditable]")
		)
			return;
		e.preventDefault();
		togglePlay();
	}

	async function copyLink() {
		const url = drumMachine.shareUrl();
		history.replaceState(null, "", url);
		try {
			await navigator.clipboard.writeText(url);
			notify("Link copied");
		} catch {
			notify("Could not copy the link", { kind: "error" });
		}
	}
	async function download(kind: "wav" | "midi") {
		try {
			const blob = kind === "wav" ? await drumMachine.wav() : drumMachine.midi();
			const a = document.createElement("a");
			a.href = URL.createObjectURL(blob);
			a.download = `${drumMachine.fileStem()}.${kind === "wav" ? "wav" : "mid"}`;
			a.click();
			setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
		} catch (e) {
			notify(`Download failed: ${errorMessage(e)}`, { kind: "error" });
		}
	}

	let p = $derived(drumMachine.project);
	let pattern = $derived(drumMachine.pattern);
</script>

<!-- The full view's listeners: the space bar, and the paint following the pointer across cells. -->
<svelte:window
	{onkeydown}
	onpointermove={(e) => paintAt(e.clientX, e.clientY)}
	onpointerup={release}
	onpointercancel={release}
/>

{#if compact}
	<div class="flex items-stretch gap-1" aria-label="Drum machine">
		<button
			class="button button-sm shrink-0 {drumMachine.running
				? 'bg-accent text-oxford border-accent opacity-100'
				: ''}"
			type="button"
			aria-pressed={drumMachine.running}
			title={drumMachine.running
				? "Stop the drums"
				: "Start the drums (the beat from /drum-machine)"}
			aria-label={drumMachine.running ? "Stop the drums" : "Start the drums"}
			onclick={togglePlay}
		>
			{#if toggle === "text"}
				<span class="w-5 text-center" aria-hidden="true">{drumMachine.running ? "On" : "Off"}</span>
			{:else}
				<span
					class="i-ph-dots-nine {drumMachine.running && drumMachine.step % 4 === 0
						? 'scale-125'
						: ''} transition-transform"
					aria-hidden="true"
				></span>
			{/if}
		</button>
		{#if showTempo}
			<label class="flex items-center gap-1 text-13px">
				<span class="sr-only">Tempo</span>
				<input
					class="field w-16 py-1 text-center text-13px tabular-nums"
					type="number"
					min={DRUM_BPM_MIN}
					max={DRUM_BPM_MAX}
					step="1"
					value={p.bpm}
					onchange={(e) => drumMachine.setBpm(Number(e.currentTarget.value))}
					aria-label="Drums tempo in beats per minute"
				/>
				<span class="text-dim">bpm</span>
			</label>
		{/if}
	</div>
{:else}
	<div class="device-chrome grid gap-4 px-3 py-4 sm-px-5 sm-py-5 w-full" aria-label="Drum machine">
		<!-- the readout -->
		<div class="device-window-bevel-md">
			<div
				class="device-screen flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 text-blue-100 font-mono tabular-nums"
			>
				<div class="flex items-baseline gap-2">
					<span class="text-40px leading-none">{p.bpm}</span>
					<span class="text-13px opacity-70">bpm</span>
				</div>
				<div class="text-12px opacity-70">
					pattern {drumMachine.current + 1} of {p.patterns.length} · {pattern.steps} steps · {kitLabel(
						p.kit,
					)}
				</div>
				<div class="text-12px opacity-70" aria-live="polite">
					{#if drumMachine.running && !drumMachine.kitReady}
						loading the kit…
					{:else if drumMachine.running}
						playing {drumMachine.playing + 1}{drumMachine.queued !== null
							? ` then ${drumMachine.queued + 1}`
							: ""} · step {drumMachine.step + 1}
					{:else}
						stopped
					{/if}
				</div>
			</div>
		</div>

		<!-- transport, tempo -->
		<div class="flex flex-wrap items-center gap-2">
			<button
				class="device-button-lg {drumMachine.running ? 'text-accent' : ''}"
				type="button"
				aria-pressed={drumMachine.running}
				title="Play or stop (space)"
				onclick={togglePlay}
			>
				<span class={drumMachine.running ? "i-ph-stop-fill" : "i-ph-play-fill"} aria-hidden="true"
				></span>
				{drumMachine.running ? "Stop" : "Play"}
			</button>
			<div class="flex items-center gap-1" role="group" aria-label="Tempo">
				{#each [-5, -1] as d (d)}
					<button
						class="device-button-lg !min-w-0 px-3"
						type="button"
						aria-label="{d} bpm"
						onclick={() => drumMachine.setBpm(p.bpm + d)}
					>
						{d}
					</button>
				{/each}
				<button
					class="device-button-lg !min-w-0 px-3"
					type="button"
					onclick={() => drumMachine.tap()}
					title="Tap the tempo"
				>
					Tap
				</button>
				{#each [1, 5] as d (d)}
					<button
						class="device-button-lg !min-w-0 px-3"
						type="button"
						aria-label="+{d} bpm"
						onclick={() => drumMachine.setBpm(p.bpm + d)}
					>
						+{d}
					</button>
				{/each}
			</div>
		</div>
		<div class="grid gap-2 sm-grid-cols-3 sm-gap-6">
			<label class="grid gap-1 text-12px text-blue-100/80">
				<span>Tempo</span>
				<input
					class="w-full accent-maximumYellow"
					type="range"
					min={DRUM_BPM_MIN}
					max={DRUM_BPM_MAX}
					step="1"
					value={p.bpm}
					oninput={(e) => drumMachine.setBpm(Number(e.currentTarget.value))}
					aria-label="Tempo in beats per minute"
				/>
			</label>
			<label class="grid gap-1 text-12px text-blue-100/80">
				<span>Swing · {Math.round(p.swing * 100)}%</span>
				<input
					class="w-full accent-maximumYellow"
					type="range"
					min="0"
					max="100"
					step="1"
					value={Math.round(p.swing * 100)}
					oninput={(e) => drumMachine.setSwing(Number(e.currentTarget.value) / 100)}
					aria-label="Swing"
				/>
			</label>
			<label class="grid gap-1 text-12px text-blue-100/80">
				<span>Humanize · {Math.round(p.humanize * 100)}%</span>
				<input
					class="w-full accent-maximumYellow"
					type="range"
					min="0"
					max="100"
					step="1"
					value={Math.round(p.humanize * 100)}
					oninput={(e) => drumMachine.setHumanize(Number(e.currentTarget.value) / 100)}
					aria-label="Humanize"
				/>
			</label>
		</div>

		<!-- the patterns: tabs, one open for editing; while playing, a chosen one waits for the end of the cycle -->
		<div class="flex flex-wrap items-center gap-1" role="group" aria-label="Patterns">
			{#each p.patterns as _, i (i)}
				{@const open = drumMachine.current === i}
				{@const sounding = drumMachine.playing === i}
				{@const next = drumMachine.queued === i}
				<button
					class="device-button-lg !min-w-0 px-3 relative {open ? 'text-accent' : ''} {next
						? 'ring-1 ring-accent'
						: ''}"
					type="button"
					aria-pressed={open}
					aria-label="Pattern {i + 1}{sounding ? ', playing' : ''}{next ? ', next' : ''}"
					title={next
						? "Next, at the end of the cycle"
						: sounding
							? "Playing"
							: "Open this pattern"}
					onclick={() => drumMachine.select(i)}
				>
					{i + 1}
					{#if sounding}
						<span
							class="absolute right-1 top-1 block h-1.5 w-1.5 rounded-full bg-green-400"
							aria-hidden="true"
						></span>
					{/if}
				</button>
			{/each}
			<button
				class="device-button-lg !min-w-0 px-3"
				type="button"
				disabled={p.patterns.length >= MAX_DRUM_PATTERNS}
				title="A new, empty pattern with these rows"
				aria-label="New pattern"
				onclick={() => drumMachine.addPattern(false)}
			>
				<span class="i-ph-plus" aria-hidden="true"></span>
			</button>
			<button
				class="device-button-lg !min-w-0 px-3"
				type="button"
				disabled={p.patterns.length >= MAX_DRUM_PATTERNS}
				title="A copy of this pattern"
				aria-label="Copy pattern"
				onclick={() => drumMachine.addPattern(true)}
			>
				<span class="i-ph-copy" aria-hidden="true"></span>
			</button>
			<button
				class="device-button-lg !min-w-0 px-3"
				type="button"
				disabled={p.patterns.length <= 1}
				title="Delete this pattern"
				aria-label="Delete pattern {drumMachine.current + 1}"
				onclick={() => drumMachine.removePattern(drumMachine.current)}
			>
				<span class="i-ph-trash" aria-hidden="true"></span>
			</button>
		</div>

		<!-- the grid -->
		<div class="grid gap-y-3" aria-label="Pattern {drumMachine.current + 1}">
			{#each pattern.rows as row, r (r)}
				<div
					class="grid gap-x-2 gap-y-1 items-center sm-grid-cols-[7.5rem_auto_4rem_4rem_1fr]"
					aria-label={voiceLabel(row.voice)}
				>
					<div class="flex items-center gap-2 sm-contents">
						<select
							class="device-field min-w-0 grow sm-grow-0 py-1.5"
							aria-label="Voice of row {r + 1}"
							value={row.voice}
							onchange={(e) => drumMachine.setVoice(r, e.currentTarget.value as DrumVoiceId)}
						>
							{#each DRUM_VOICES as v (v.id)}
								<option value={v.id}>{v.label}</option>
							{/each}
						</select>
						<div class="flex items-center gap-1">
							<button
								class="device-button-lg !min-w-0 !h-8 !px-2.5 text-13px {row.mute
									? 'text-accent'
									: ''}"
								type="button"
								aria-pressed={row.mute}
								aria-label="Mute {voiceLabel(row.voice)}"
								title="Mute"
								onclick={() => drumMachine.toggleMute(r)}>M</button
							>
							<button
								class="device-button-lg !min-w-0 !h-8 !px-2.5 text-13px {drumMachine.solo[r]
									? 'text-accent'
									: ''}"
								type="button"
								aria-pressed={drumMachine.solo[r] ?? false}
								aria-label="Solo {voiceLabel(row.voice)}"
								title="Solo"
								onclick={() => drumMachine.toggleSolo(r)}>S</button
							>
							<button
								class="device-button-lg !min-w-0 !h-8 !px-2 text-13px"
								type="button"
								aria-label="Remove {voiceLabel(row.voice)}"
								title="Remove the row"
								disabled={pattern.rows.length <= 1}
								onclick={() => drumMachine.removeRow(r)}
							>
								<span class="i-ph-x" aria-hidden="true"></span>
							</button>
						</div>
						<input
							class="hidden sm-block w-full accent-maximumYellow"
							type="range"
							min="0"
							max="1"
							step="0.01"
							value={row.level}
							oninput={(e) => drumMachine.setLevel(r, Number(e.currentTarget.value))}
							aria-label="Level of {voiceLabel(row.voice)}"
							title="Level"
						/>
						<input
							class="hidden sm-block w-full accent-blue-300"
							type="range"
							min="-1"
							max="1"
							step="0.01"
							value={row.pan}
							oninput={(e) => drumMachine.setPan(r, Number(e.currentTarget.value))}
							ondblclick={() => drumMachine.setPan(r, 0)}
							aria-label="Pan of {voiceLabel(row.voice)}"
							title="Pan (double-click for the centre)"
						/>
					</div>
					<div class="grid grid-cols-8 sm-grid-cols-16 gap-1 touch-pan-y">
						{#each row.cells as cell, s (s)}
							{@const now = drumMachine.step === s && drumMachine.playing === drumMachine.current}
							{@const offBeat = Math.floor(s / 4) % 2 === 1}
							<button
								class="aspect-square w-full rounded-sm border transition-colors duration-75 {cell ===
								3
									? 'bg-accent border-white'
									: cell === 2
										? 'bg-accent border-accent'
										: cell === 1
											? 'bg-accent/40 border-accent/50'
											: offBeat
												? 'bg-dark/60 border-white/10'
												: 'bg-dark/30 border-white/10'} {now
									? 'ring-2 ring-blue-100 ring-inset'
									: ''}"
								type="button"
								aria-pressed={cell > 0}
								aria-label="{voiceLabel(row.voice)}, step {s + 1}{cell === 3
									? ', accent'
									: cell === 1
										? ', ghost'
										: ''}"
								title={cell ? "Hold, shift-click or right-click for the velocity" : undefined}
								data-row={r}
								data-step={s}
								onpointerdown={(e) => press(e, r, s, cell)}
								oncontextmenu={(e) => {
									e.preventDefault();
									drumMachine.cycleVelocity(r, s);
								}}
							></button>
						{/each}
					</div>
				</div>
			{/each}
		</div>

		<!-- steps, kit, and the rest -->
		<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
			<div class="flex items-center gap-1" role="group" aria-label="Steps">
				{#each DRUM_STEP_CHOICES as n (n)}
					<button
						class="device-button-lg !min-w-0 px-3 {pattern.steps === n ? 'text-accent' : ''}"
						type="button"
						aria-pressed={pattern.steps === n}
						title="{n} steps"
						onclick={() => drumMachine.setSteps(n)}
					>
						{n}
					</button>
				{/each}
			</div>
			<div class="flex items-center gap-1" role="group" aria-label="Kit">
				{#each DRUM_KITS as k (k.id)}
					<button
						class="device-button-lg !min-w-0 px-3 {p.kit === k.id ? 'text-accent' : ''}"
						type="button"
						aria-pressed={p.kit === k.id}
						onclick={() => drumMachine.setKit(k.id)}
					>
						{k.label}
					</button>
				{/each}
			</div>
			<div class="flex flex-wrap items-center gap-1 ml-auto">
				<button
					class="device-button-lg !min-w-0 px-3"
					type="button"
					disabled={pattern.rows.length >= MAX_DRUM_ROWS}
					onclick={() => drumMachine.addRow()}
				>
					<span class="i-ph-plus" aria-hidden="true"></span>
					Row
				</button>
				<button
					class="device-button-lg !min-w-0 px-3"
					type="button"
					onclick={() => drumMachine.clear()}
					title="Every cell off"
				>
					Clear
				</button>
				<button
					class="device-button-lg !min-w-0 px-3"
					type="button"
					onclick={copyLink}
					title="Copy a link to this project"
				>
					<span class="i-ph-link" aria-hidden="true"></span>
					Copy link
				</button>
				<ContextMenu
					ariaLabel="Download"
					title="Download this pattern"
					iconClass="i-ph-download-simple"
					label="Download"
					buttonBaseClasses="device-button-lg !min-w-0 px-3"
					items={[
						{
							id: "download-wav",
							kind: "button",
							label: "WAV, one cycle",
							iconClass: "i-ph-waveform",
							action: () => download("wav"),
						},
						{
							id: "download-midi",
							kind: "button",
							label: "MIDI, for a DAW",
							iconClass: "i-ph-piano-keys",
							action: () => download("midi"),
						},
					]}
				/>
			</div>
		</div>
	</div>
{/if}
