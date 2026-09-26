<script lang="ts">
	import {
		BEATS_PER_BAR,
		loadMetronomePreferences,
		saveMetronomePreferences,
	} from "$lib/utils/metronomePreferences";
	import { BPM_MAX, BPM_MIN, tapTempo } from "$lib/utils/tapTempo";
	import { onDestroy } from "svelte";

	/**
	 * A metronome: clicks from the Web Audio clock (a short sine, the first
	 * beat of the bar higher), scheduled a tenth of a second ahead so a busy
	 * page never makes it stumble. Full: tempo readout with steps and a
	 * slider, beats to the bar, tap tempo, a beat indicator. Compact: a
	 * toggle with the icon and, when on, the tempo to adjust; for a device
	 * like the Idea Recorder. `start()`, `stop()` and `toggle()` are exported.
	 */
	interface Props {
		compact?: boolean;
		onrunning?: (running: boolean) => void;
	}
	let { compact = false, onrunning }: Props = $props();

	const LOOKAHEAD_S = 0.1;
	const TICK_MS = 25;

	let prefs = $state(loadMetronomePreferences());
	let running = $state(false);
	/** The beat sounding now, 0-based, for the indicator; -1 between runs. */
	let beat = $state(-1);
	let taps: number[] = [];

	let ctx: AudioContext | null = null;
	let timer: ReturnType<typeof setInterval> | null = null;
	let nextTime = 0;
	let nextBeat = 0;
	let visualTimers: ReturnType<typeof setTimeout>[] = [];

	function click(at: number, accent: boolean) {
		if (!ctx) return;
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.frequency.value = accent ? 1200 : 800;
		gain.gain.setValueAtTime(0.0001, at);
		gain.gain.exponentialRampToValueAtTime(accent ? 0.8 : 0.5, at + 0.002);
		gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
		osc.connect(gain).connect(ctx.destination);
		osc.start(at);
		osc.stop(at + 0.06);
	}
	function schedule() {
		if (!ctx) return;
		while (nextTime < ctx.currentTime + LOOKAHEAD_S) {
			const b = nextBeat;
			click(nextTime, b === 0);
			const delay = Math.max(0, (nextTime - ctx.currentTime) * 1000);
			visualTimers.push(setTimeout(() => (beat = b), delay));
			nextTime += 60 / prefs.bpm;
			nextBeat = (b + 1) % prefs.beatsPerBar;
		}
		visualTimers = visualTimers.slice(-16);
	}

	export async function start() {
		if (running) return;
		ctx ??= new AudioContext();
		if (ctx.state !== "running") await ctx.resume().catch(() => {});
		nextTime = ctx.currentTime + 0.05;
		nextBeat = 0;
		timer = setInterval(schedule, TICK_MS);
		running = true;
		onrunning?.(true);
	}
	export function stop() {
		if (timer) clearInterval(timer);
		timer = null;
		for (const t of visualTimers) clearTimeout(t);
		visualTimers = [];
		beat = -1;
		if (running) {
			running = false;
			onrunning?.(false);
		}
	}
	export function toggle() {
		if (running) stop();
		else void start();
	}

	function setBpm(v: number) {
		if (!Number.isFinite(v)) return;
		prefs.bpm = Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(v)));
		saveMetronomePreferences(prefs);
	}
	function setBeats(n: number) {
		prefs.beatsPerBar = n;
		nextBeat = 0;
		saveMetronomePreferences(prefs);
	}
	function tap() {
		taps = [...taps, performance.now()].slice(-8);
		const bpm = tapTempo(taps);
		if (bpm) setBpm(bpm);
	}

	onDestroy(() => {
		stop();
		void ctx?.close();
		ctx = null;
	});
</script>

{#if compact}
	<!-- A toggle and, when on, the tempo: for a device's control row. -->
	<div class="flex items-center gap-1" aria-label="Metronome">
		<button
			class="button button-sm shrink-0 {running ? 'text-accent border-accent' : ''}"
			type="button"
			aria-pressed={running}
			title={running ? "Stop the metronome" : "Start the metronome"}
			aria-label={running ? "Stop the metronome" : "Start the metronome"}
			onclick={toggle}
		>
			<span
				class="i-ph-metronome {running && beat === 0 ? 'scale-125' : ''} transition-transform"
				aria-hidden="true"
			></span>
		</button>
		{#if running}
			<label class="flex items-center gap-1 text-13px">
				<span class="sr-only">Tempo</span>
				<input
					class="field w-16 py-1 text-center text-13px tabular-nums"
					type="number"
					min={BPM_MIN}
					max={BPM_MAX}
					step="1"
					value={prefs.bpm}
					onchange={(e) => setBpm(Number(e.currentTarget.value))}
					aria-label="Tempo in beats per minute"
				/>
				<span class="text-dim">bpm</span>
			</label>
		{/if}
	</div>
{:else}
	<div class="device-chrome grid gap-5 px-5 py-5 w-full max-w-600px" aria-label="Metronome">
		<!-- the readout -->
		<div class="device-window-bevel-md">
			<div class="device-screen grid place-items-center gap-2 py-5 text-blue-100">
				<div class="flex items-baseline gap-2 font-mono tabular-nums">
					<span class="text-56px leading-none">{prefs.bpm}</span>
					<span class="text-14px opacity-70">bpm</span>
				</div>
				<!-- the beat indicator: one light per beat, the first brighter -->
				<div
					class="flex items-center gap-2"
					role="img"
					aria-label="Beat {beat + 1} of {prefs.beatsPerBar}"
				>
					{#each Array.from({ length: prefs.beatsPerBar }, (_, i) => i) as i (i)}
						<span
							class="block h-3 w-3 rounded-full transition-colors {beat === i
								? i === 0
									? 'bg-accent'
									: 'bg-green-400'
								: 'bg-blue-100/15'}"
						></span>
					{/each}
				</div>
				<div class="text-12px font-mono opacity-70">
					{prefs.beatsPerBar} beats to the bar · {running ? "running" : "stopped"}
				</div>
			</div>
		</div>

		<!-- tempo: steps and a slider -->
		<div class="grid gap-2">
			<div class="flex items-center justify-center gap-2">
				{#each [-10, -1] as d (d)}
					<button
						class="device-button-lg !min-w-0 px-3"
						type="button"
						onclick={() => setBpm(prefs.bpm + d)}
					>
						{d}
					</button>
				{/each}
				<button
					class="device-button-lg !min-w-0 px-4"
					type="button"
					onclick={tap}
					title="Tap the tempo"
				>
					Tap
				</button>
				{#each [1, 10] as d (d)}
					<button
						class="device-button-lg !min-w-0 px-3"
						type="button"
						onclick={() => setBpm(prefs.bpm + d)}
					>
						+{d}
					</button>
				{/each}
			</div>
			<label class="block">
				<span class="sr-only">Tempo</span>
				<input
					class="w-full accent-maximumYellow"
					type="range"
					min={BPM_MIN}
					max={BPM_MAX}
					step="1"
					value={prefs.bpm}
					oninput={(e) => setBpm(Number(e.currentTarget.value))}
					aria-label="Tempo in beats per minute"
				/>
			</label>
		</div>

		<!-- beats to the bar, and the switch -->
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div class="flex items-center gap-1" role="group" aria-label="Beats to the bar">
				{#each BEATS_PER_BAR as n (n)}
					<button
						class="device-button-lg !min-w-0 px-3 {prefs.beatsPerBar === n ? 'text-accent' : ''}"
						type="button"
						aria-pressed={prefs.beatsPerBar === n}
						onclick={() => setBeats(n)}
					>
						{n}
					</button>
				{/each}
			</div>
			<button
				class="device-button-lg {running ? 'text-accent' : ''}"
				type="button"
				aria-pressed={running}
				onclick={toggle}
			>
				<span class="i-ph-metronome" aria-hidden="true"></span>
				{running ? "Stop" : "Start"}
			</button>
		</div>
	</div>
{/if}
