<script lang="ts">
	import { detectPitch, frequencyOfMidi, noteFromFrequency, noteLabel } from "$lib/audio/pitch";
	import { TUNINGS, TUNINGS_OPTIONS } from "$lib/constants/tunings";
	import { audioSession } from "$lib/utils/audioSession";
	import { errorMessage } from "$lib/utils/errorMessage";
	import { loadTunerPreferences, saveTunerPreferences } from "$lib/utils/tunerPreferences";
	import { onDestroy, onMount } from "svelte";
	import ComboBox from "$lib/components/ComboBox.svelte";
	import ContextMenu from "$lib/components/ContextMenu.svelte";

	/**
	 * A chromatic tuner: listens to the microphone, reads the pitch twenty
	 * times a second (src/lib/audio/pitch.ts) and shows the nearest note, the
	 * cents off on a needle, and which string of the chosen tuning it is.
	 * Self-contained, so it sits in a popover on the recorder page or on its
	 * own page: `start()` and `stop()` open and close the microphone (a page
	 * calls them as its popover opens and closes; the button here does the
	 * same for a visitor), and it stops itself when destroyed.
	 */
	interface Props {
		/** Open the microphone as soon as it mounts (only from a user gesture, or the browser refuses). */
		autostart?: boolean;
		/** Called when the microphone opens or closes, so a recorder on the same page can stay out of its way. */
		onrunning?: (running: boolean) => void;
		/**
		 * Open the microphone when the pointer first enters the page (the tuner's
		 * own page: it is what the visitor came for). Off for an instance that
		 * sits in a closed popover, which must not listen until opened. Once the
		 * person turns it off, it stays off.
		 */
		startOnHover?: boolean;
	}
	let { autostart = false, onrunning, startOnHover = false }: Props = $props();

	const WINDOW = 4096;
	const FRAME_MS = 50;
	/** Within this many cents the needle reads in tune. */
	const IN_TUNE_CENTS = 5;

	let manuallyTurnedOff = $state(false);
	let prefs = $state(loadTunerPreferences());
	let tuning = $derived(TUNINGS.find((t) => t.id === prefs.tuningId) ?? TUNINGS[0]);
	let running = $state(false);
	let error = $state<string | null>(null);
	/** What the microphone hears right now, or null between notes. */
	let reading = $state<{ frequency: number; clarity: number } | null>(null);
	/** Smoothed cents for the needle, so it settles rather than jitters. */
	let needle = $state(0);
	let level = $state(0);
	/** Ticks since the last clear reading; the display holds a note briefly, then clears. */
	let quiet = 0;

	let note = $derived(reading ? noteFromFrequency(reading.frequency, prefs.a4) : null);
	/** The string of the tuning nearest the note heard. */
	let nearestString = $derived.by(() => {
		if (!note || tuning.notes.length === 0) return null;
		let best = tuning.notes[0];
		for (const n of tuning.notes)
			if (Math.abs(n - note.midi) < Math.abs(best - note.midi)) best = n;
		return best;
	});
	let inTune = $derived(!!note && Math.abs(needle) <= IN_TUNE_CENTS);

	let stream: MediaStream | null = null;
	let ctx: AudioContext | null = null;
	let analyser: AnalyserNode | null = null;
	let timer: ReturnType<typeof setInterval> | null = null;
	const buffer = new Float32Array(WINDOW);

	export async function start() {
		if (running || typeof navigator === "undefined") return;
		error = null;
		if (!navigator.mediaDevices?.getUserMedia) {
			error = "This browser cannot open the microphone.";
			return;
		}
		// WebKit captures only under "auto" or "play-and-record" (the stem player may have set "playback").
		const session = audioSession();
		if (session) session.type = "play-and-record";
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				audio: {
					echoCancellation: false,
					noiseSuppression: false,
					autoGainControl: false,
					sampleRate: { ideal: 48000 },
					channelCount: { ideal: 1 },
				},
			});
		} catch (e) {
			error =
				(e as { name?: string }).name === "NotAllowedError"
					? "Microphone access was refused. Allow it in the browser to tune."
					: errorMessage(e);
			return;
		}
		ctx = new AudioContext();
		analyser = ctx.createAnalyser();
		analyser.fftSize = WINDOW;
		analyser.smoothingTimeConstant = 0;
		ctx.createMediaStreamSource(stream).connect(analyser);
		running = true;
		onrunning?.(true);
		timer = setInterval(tick, FRAME_MS);
	}

	export function stop(manuallyStopped = false) {
		if (manuallyStopped) manuallyTurnedOff = true;
		if (timer) clearInterval(timer);
		timer = null;
		stream?.getTracks().forEach((t) => t.stop());
		stream = null;
		void ctx?.close();
		ctx = null;
		analyser = null;
		const session = audioSession();
		if (session && session.type === "play-and-record") session.type = "auto";
		if (running) {
			running = false;
			onrunning?.(false);
		}
		reading = null;
		level = 0;
		needle = 0;
	}

	function tick() {
		if (!analyser || !ctx) return;
		analyser.getFloatTimeDomainData(buffer);
		let sum = 0;
		for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
		level = Math.min(1, Math.sqrt(sum / buffer.length) * 4);
		const p = level > 0.01 ? detectPitch(buffer, ctx.sampleRate) : null;
		if (p) {
			quiet = 0;
			reading = p;
			const cents = noteFromFrequency(p.frequency, prefs.a4).cents;
			// A new note snaps; the same note settles.
			needle = reading && Math.abs(cents - needle) > 30 ? cents : needle + (cents - needle) * 0.35;
		} else if (++quiet > 12) {
			reading = null;
			needle = 0;
		}
	}

	function savePrefs() {
		saveTunerPreferences(prefs);
	}

	onMount(() => {
		if (autostart) void start();
	});
	onDestroy(stop);

	function handleMouseEnter() {
		if (startOnHover && !running && !manuallyTurnedOff) void start();
	}
</script>

<svelte:body onmouseenter={handleMouseEnter}></svelte:body>

<div
	class="relative bg-slate-400 bg-gradient-to-b from-slate-500/10 via-slate-500/60 to-slate-500/80 px-5 py-5 rounded-md shadow-lg shadow-black min-h-380px w-full max-w-600px"
	aria-label="Tuner"
>
	<div class="grid grid-cols-1">
		<!-- The note heard, big; the frequency under it. -->
		<div
			class="grid place-items-center gap-1 rounded-md border border-current/10 bg-oxford-900 bg-gradient-to-br from-oxford-900 to-oxford-850 px-4 pt-2 pb-5 inner-shadow relative h-165px pointer-events-none /select-none h-165px"
		>
			<div class="grid grid-cols-[1fr_auto] w-full gap-3 items-center">
				<!-- input level -->
				<div
					class="h-1 w-full overflow-hidden rounded-lg bg-white/0 shadow-inner shadow-black/0"
					role="meter"
					aria-label="Input level"
					aria-valuemin="0"
					aria-valuemax="100"
					aria-valuenow={Math.round(level * 100)}
				>
					<div
						class="h-full rounded bg-blue-100/60 shadow-yellow"
						style:width="{level * 50}%"
					></div>
				</div>

				<!-- on/off light -->
				<div class="w-3 h-3 rounded-full {running ? 'bg-green-400' : 'bg-oxford-800'}"></div>
			</div>

			<!-- note name & octave -->
			<div
				class="font-mono text-56px leading-none tabular-nums h-56px leading-none {inTune
					? 'text-green-300'
					: ''}"
				aria-live="polite"
				aria-atomic="true"
			>
				{#if note}
					<span class="text-blue-100 opacity-95 inline-block font-sans">{note.name}</span><span
						class="ml-1 text-blue-100 text-24px opacity-90 inline-block font-sans"
						>{note.octave}</span
					>
				{:else}
					<span class="opacity-30">&nbsp;</span>
				{/if}
			</div>

			<!-- note details -->
			<div class="text-13px font-mono tabular-nums opacity-85 h-20px">
				{#if reading && note}
					{reading.frequency.toFixed(1)} Hz · {needle > 0 ? "+" : ""}{needle.toFixed(0)} cents
					{#if inTune}· in tune{:else if needle > 0}· sharp{:else}· flat{/if}
				{:else if running}
					&nbsp;
				{:else}
					&nbsp;
				{/if}
			</div>
			<!-- The needle: −50 to +50 cents across the bar, green when in tune. -->
			<div
				class="relative mt-2 h-3 w-full max-w-sm rounded {running
					? 'bg-blue-300/10'
					: 'bg-blue-300/5'}"
				aria-hidden="true"
			>
				<div
					class="absolute inset-y-0 left-1/2 w-px {running ? 'bg-white/40' : 'bg-white/10'}"
				></div>
				<div
					class="absolute inset-y-0 left-[45%] w-[10%] rounded {running
						? 'bg-green-400/15'
						: 'bg-green-400/0'}"
				></div>
				{#if note}
					<div
						class="absolute top-1/2 h-5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded {inTune
							? 'bg-green-300'
							: 'bg-maximumYellow'}"
						style:left="{50 + Math.max(-50, Math.min(50, needle))}%"
					></div>
				{/if}
			</div>
			<div
				class="flex w-full max-w-sm justify-between text-10px h-15px {running
					? 'opacity-90'
					: 'opacity-20'} font-mono"
				aria-hidden="true"
			>
				<span>−50</span><span>0</span><span>+50</span>
			</div>
		</div>

		<!-- The strings of the chosen tuning; the one nearest the note heard lights up. Chromatic mode has none. -->
		<div class="text-13px text-white/60 min-h-42px select-none pointer-events-none">
			{#if tuning.notes.length > 0}
				<div
					class="flex flex-wrap items-center justify-center gap-2 mt-3"
					role="list"
					aria-label="Strings"
				>
					{#each tuning.notes as midi (midi)}
						<span
							role="listitem"
							class="bg-oxford-900 rounded border px-3 py-1 font-mono text-14px tabular-nums shadow-inner {nearestString ===
							midi
								? inTune
									? 'border-green-300 text-green-300'
									: 'border-accent text-accent'
								: 'border-white/15 text-white/60'}"
							title="{frequencyOfMidi(midi, prefs.a4).toFixed(2)} Hz"
						>
							<span class={running ? "opacity-100" : "opacity-10"}
								>{noteLabel(midi).replace(/-?\d+$/, "")}</span
							>
						</span>
					{/each}
				</div>
			{/if}
		</div>

		<!-- control bar -->
		<div class="grid grid-cols-[1fr_auto] place-content-center gap-3 text-15px mt-5">
			<!-- select tuning (not a <label>: the listbox popover is a descendant, so a click on an
			     option would activate the label's control, the trigger, and reopen the list) -->
			<div class="block">
				<ComboBox
					ariaLabel="Tuning"
					disabled={!running}
					buttonClasses={running ? "!text-current/80" : "!text-current/5"}
					options={TUNINGS_OPTIONS}
					onchange={savePrefs}
					bind:value={prefs.tuningId}
				/>
			</div>

			{#snippet adjustA4()}
				<div class="">
					<!-- adjust A4 -->
					<div class="block w-full">
						<h4 class="sr-only">Adjust A4</h4>

						<label
							class="grid grid-cols-[auto_1fr] gap-2 text-13px mb-2 place-content-start place-items-center w-full overflow-hidden h-8"
						>
							<div class="text-nowrap w-auto h-full flex items-center leading-none">A4 (Hz)</div>
							<div class="flex w-full h-full items-center">
								<input
									class="block bg-blue-300/5 border rounded-md px-3 py-1 h-full w-full tabular-nums text-15px"
									type="number"
									min="400"
									max="480"
									step="1"
									bind:value={prefs.a4}
									onchange={savePrefs}
								/>
							</div>
						</label>
					</div>
				</div>
			{/snippet}

			<ContextMenu
				disabled={!running}
				buttonClasses="h-36px bg-blue-300/5"
				items={[{ snippet: adjustA4 }]}
			/>
		</div>

		<!-- on / off -->
		<div class="mt-8">
			<button
				class="{running
					? 'text-current/80'
					: 'text-current/60'} flex items-center gap-2 rounded-md px-3 py-2 bg-slate-700 text-current text-15px shadow-md hover-bg-slate-800"
				type="button"
				onclick={() => (running ? stop(true) : void start())}
			>
				<span class="block text-15px i-ph-power" aria-hidden="true"></span>
				<span class="text-14px">On / Off</span>
			</button>
		</div>

		{#if error}
			<p class="text-sm text-red-400" role="alert">{error}</p>
		{/if}

		<div
			class="absolute text-12px uppercase font-sans text-oxford bottom-3 right-3 text-shadow opacity-90 font-600 select-none pointer-events-none"
		>
			SS Tuner 001
		</div>
	</div>
</div>
