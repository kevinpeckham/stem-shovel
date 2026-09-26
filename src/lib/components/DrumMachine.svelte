<script lang="ts">
	import { drumMachine } from "$lib/audio/drumMachine.svelte";
	import {
		DRUM_BPM_MAX,
		DRUM_BPM_MIN,
		DRUM_KITS,
		DRUM_STEP_CHOICES,
		DRUM_VOICES,
		MAX_DRUM_ROWS,
		type DrumVoiceId,
	} from "$lib/constants/drumMachine";
	import { notify } from "$lib/state/notifications.svelte";
	import { onMount } from "svelte";

	/**
	 * The drum machine as a device (docs/drum-machine.md): a readout, the
	 * transport and tempo, the grid of rows and steps, and the row controls.
	 * A view of the page's one engine (src/lib/audio/drumMachine.svelte.ts).
	 * On a phone a bar shows as two lines of eight, so every cell stays big
	 * enough to tap; the level sliders show from sm up.
	 */
	onMount(() => drumMachine.load());

	const voiceLabel = (id: DrumVoiceId) => DRUM_VOICES.find((v) => v.id === id)?.label ?? id;
	const kitLabel = (id: string) => DRUM_KITS.find((k) => k.id === id)?.label ?? id;

	// Painting: press a cell and drag across others to set them all the same way.
	let painting = $state<boolean | null>(null);
	function paintAt(x: number, y: number) {
		if (painting === null) return;
		const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-row][data-step]");
		if (!el) return;
		drumMachine.setCell(Number(el.dataset.row), Number(el.dataset.step), painting);
	}

	function onkeydown(e: KeyboardEvent) {
		const t = e.target as HTMLElement | null;
		if (e.key !== " " || t?.closest("input, select, textarea, [contenteditable]")) return;
		e.preventDefault();
		drumMachine.toggle();
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

	let p = $derived(drumMachine.pattern);
</script>

<svelte:window {onkeydown} onpointerup={() => (painting = null)} />

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
				{p.steps} steps · swing {Math.round(p.swing * 100)}% · {kitLabel(p.kit)}
			</div>
			<div class="text-12px opacity-70" aria-live="polite">
				{#if drumMachine.running && !drumMachine.kitReady}
					loading the kit…
				{:else if drumMachine.running}
					step {drumMachine.step + 1} of {p.steps}
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
			onclick={() => drumMachine.toggle()}
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
	<div class="grid gap-2 sm-grid-cols-2 sm-gap-6">
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
			<span>Swing</span>
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
	</div>

	<!-- the grid -->
	<div
		class="grid gap-y-3"
		aria-label="Pattern"
		onpointermove={(e) => paintAt(e.clientX, e.clientY)}
	>
		{#each p.rows as row, r (r)}
			<div
				class="grid gap-x-2 gap-y-1 items-center sm-grid-cols-[7.5rem_auto_5rem_1fr]"
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
							disabled={p.rows.length <= 1}
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
					/>
				</div>
				<div class="grid grid-cols-8 sm-grid-cols-16 gap-1 touch-pan-y">
					{#each row.cells as cell, s (s)}
						{@const on = cell > 0}
						{@const now = drumMachine.step === s}
						{@const offBeat = Math.floor(s / 4) % 2 === 1}
						<button
							class="aspect-square w-full rounded-sm border transition-colors duration-75 {on
								? now
									? 'bg-yellow-200 border-white'
									: 'bg-accent border-accent'
								: now
									? 'bg-blue-100/30 border-blue-100/40'
									: offBeat
										? 'bg-dark/60 border-white/10'
										: 'bg-dark/30 border-white/10'}"
							type="button"
							aria-pressed={on}
							aria-label="{voiceLabel(row.voice)}, step {s + 1}"
							data-row={r}
							data-step={s}
							onpointerdown={(e) => {
								if (e.button !== 0) return;
								painting = !on;
								drumMachine.setCell(r, s, painting);
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
					class="device-button-lg !min-w-0 px-3 {p.steps === n ? 'text-accent' : ''}"
					type="button"
					aria-pressed={p.steps === n}
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
		<div class="flex items-center gap-1 ml-auto">
			<button
				class="device-button-lg !min-w-0 px-3"
				type="button"
				disabled={p.rows.length >= MAX_DRUM_ROWS}
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
				title="Copy a link to this pattern"
			>
				<span class="i-ph-link" aria-hidden="true"></span>
				Copy link
			</button>
		</div>
	</div>
</div>
