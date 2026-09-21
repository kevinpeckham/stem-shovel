<script lang="ts">
	import { detectPitch, frequencyOfMidi, noteFromFrequency, noteLabel } from "$lib/audio/pitch";
	import { TUNINGS } from "$lib/constants/tunings";
	import { audioSession } from "$lib/utils/audioSession";
	import { errorMessage } from "$lib/utils/errorMessage";
	import { loadTunerPreferences, saveTunerPreferences } from "$lib/utils/tunerPreferences";
	import { onDestroy, onMount } from "svelte";

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
	}
	let { autostart = false, onrunning }: Props = $props();

	const WINDOW = 4096;
	const FRAME_MS = 50;
	/** Within this many cents the needle reads in tune. */
	const IN_TUNE_CENTS = 5;

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

	export function stop() {
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
</script>

<div class="grid gap-4" aria-label="Tuner">
	<!-- The note heard, big; the frequency under it. -->
	<div
		class="grid place-items-center gap-1 rounded-md border border-current/40 bg-black/20 px-4 py-5"
	>
		<div
			class="font-mono text-56px leading-none tabular-nums {inTune ? 'text-green-300' : ''}"
			aria-live="polite"
			aria-atomic="true"
		>
			{#if note}
				{note.name}<span class="text-24px opacity-60">{note.octave}</span>
			{:else}
				<span class="opacity-30">—</span>
			{/if}
		</div>
		<div class="text-13px text-dim tabular-nums">
			{#if reading && note}
				{reading.frequency.toFixed(1)} Hz · {needle > 0 ? "+" : ""}{needle.toFixed(0)} cents
				{#if inTune}· in tune{:else if needle > 0}· sharp{:else}· flat{/if}
			{:else if running}
				Play a string…
			{:else}
				Not listening
			{/if}
		</div>
		<!-- The needle: −50 to +50 cents across the bar, green when in tune. -->
		<div class="relative mt-2 h-3 w-full max-w-sm rounded bg-blue-300/10" aria-hidden="true">
			<div class="absolute inset-y-0 left-1/2 w-px bg-white/40"></div>
			<div class="absolute inset-y-0 left-[45%] w-[10%] rounded bg-green-400/15"></div>
			{#if note}
				<div
					class="absolute top-1/2 h-5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded {inTune
						? 'bg-green-300'
						: 'bg-maximumYellow'}"
					style:left="{50 + Math.max(-50, Math.min(50, needle))}%"
				></div>
			{/if}
		</div>
		<div class="flex w-full max-w-sm justify-between text-10px text-dim" aria-hidden="true">
			<span>−50</span><span>0</span><span>+50</span>
		</div>
	</div>

	<!-- The strings of the chosen tuning; the one nearest the note heard lights up. Chromatic mode has none. -->
	{#if tuning.notes.length > 0}
		<div class="flex flex-wrap items-center justify-center gap-2" role="list" aria-label="Strings">
			{#each tuning.notes as midi (midi)}
				<span
					role="listitem"
					class="rounded border px-3 py-1 font-mono text-sm tabular-nums {nearestString === midi
						? inTune
							? 'border-green-300 text-green-300'
							: 'border-maximumYellow text-maximumYellow'
						: 'border-white/15 opacity-70'}"
					title="{frequencyOfMidi(midi, prefs.a4).toFixed(2)} Hz"
				>
					{noteLabel(midi)}
				</span>
			{/each}
		</div>
	{/if}

	<div class="flex flex-wrap items-end gap-3 text-sm">
		<label class="block grow">
			<span class="text-13px text-dim">Tuning</span>
			<select class="mt-1 field text-sm" bind:value={prefs.tuningId} onchange={savePrefs}>
				{#each TUNINGS as t (t.id)}
					<option value={t.id}>{t.label}</option>
				{/each}
			</select>
		</label>
		<label class="block w-24">
			<span class="text-13px text-dim">A4 (Hz)</span>
			<input
				class="mt-1 field text-sm tabular-nums"
				type="number"
				min="400"
				max="480"
				step="1"
				bind:value={prefs.a4}
				onchange={savePrefs}
			/>
		</label>
		<button
			class="button button-sm {running ? '' : 'button-accent'}"
			type="button"
			onclick={() => (running ? stop() : void start())}
		>
			<span class={running ? "i-ph-stop" : "i-ph-microphone"} aria-hidden="true"></span>
			{running ? "Stop" : "Start listening"}
		</button>
	</div>
	{#if running}
		<div
			class="h-1 w-full overflow-hidden rounded bg-blue-300/10"
			role="meter"
			aria-label="Input level"
			aria-valuemin="0"
			aria-valuemax="100"
			aria-valuenow={Math.round(level * 100)}
		>
			<div class="h-full rounded bg-blue-300/60" style:width="{level * 100}%"></div>
		</div>
	{/if}
	{#if error}
		<p class="text-sm text-red-400" role="alert">{error}</p>
	{/if}
	<p class="text-13px text-dim">
		A note reads in tune within ±{IN_TUNE_CENTS} cents. Chromatic mode names whatever it hears, for any
		instrument or tuning; a preset also lights the string. Turn off any effects and let the note ring;
		the needle settles as the string does.
	</p>
</div>
