<script lang="ts">
	import { postJson, uploadRecordingFile, type RecordingReservation } from "$lib/upload";
	import { errorMessage } from "$lib/utils/errorMessage";
	import { formatTime } from "$lib/utils/formatTime";
	import { recordingMimeType } from "$lib/utils/recordingMimeType";
	import { onDestroy } from "svelte";

	/**
	 * The demo recorder (docs/demo-recording.md): one take at a time from the
	 * microphone, with pause, stop, undo (retake) and save. Saving uploads the
	 * take as a scratch recording of the account; the page decides what
	 * happens next (add to a song, keep in the library).
	 */
	interface Props {
		accountId: string;
		/** Called with the new recording's id and title once the upload is reported. */
		onsaved: (recording: { id: string; title: string }) => void;
	}
	let { accountId, onsaved }: Props = $props();

	type Phase = "idle" | "requesting" | "recording" | "paused" | "reviewing" | "saving";
	let phase = $state<Phase>("idle");
	let elapsed = $state(0);
	let level = $state(0);
	let peak = $state(0);
	let notice = $state<string | null>(null);
	let take = $state<Blob | null>(null);
	let takeUrl = $state<string | null>(null);
	let title = $state("");
	let progress = $state(0);
	let inputLabel = $state<string | null>(null);

	let stream: MediaStream | null = null;
	let recorder: MediaRecorder | null = null;
	let chunks: Blob[] = [];
	let format: { mimeType: string; ext: string } | null = null;
	let ctx: AudioContext | null = null;
	let analyser: AnalyserNode | null = null;
	let meterFrame = 0;
	let wakeLock: WakeLockSentinel | null = null;
	/** The timer: accumulated seconds before the current run, and when the run started. */
	let runStart = 0;
	let runBase = 0;
	let tick: ReturnType<typeof setInterval> | null = null;

	const supported = typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

	function defaultTitle() {
		const now = new Date();
		const day = now.toLocaleDateString("en-US", { month: "short", day: "numeric" });
		const time = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
		return `Recording ${day} ${time}`;
	}

	async function start() {
		notice = null;
		format = recordingMimeType((t) => MediaRecorder.isTypeSupported(t));
		if (!format) {
			notice = "This browser cannot record audio. Try Safari, Chrome or Firefox.";
			return;
		}
		phase = "requesting";
		try {
			// The three voice processors are on by default and ruin an instrument.
			stream = await navigator.mediaDevices.getUserMedia({
				audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
			});
		} catch (e) {
			phase = "idle";
			const name = (e as { name?: string }).name;
			notice =
				name === "NotAllowedError"
					? "Microphone access was refused. Allow it for this site in your browser settings, then try again."
					: name === "NotFoundError"
						? "No microphone was found."
						: errorMessage(e);
			return;
		}
		const track = stream.getAudioTracks()[0];
		inputLabel = track?.label || null;
		// A phone call or an unplugged interface ends the track: keep what we have.
		if (track) track.onended = () => onTrackEnded();
		startMeter(stream);
		chunks = [];
		recorder = new MediaRecorder(stream, { mimeType: format.mimeType });
		recorder.ondataavailable = (e) => {
			if (e.data.size > 0) chunks.push(e.data);
		};
		recorder.onstop = () => finishTake();
		recorder.start(1000);
		runBase = 0;
		runStart = performance.now();
		elapsed = 0;
		tick = setInterval(() => (elapsed = runBase + (performance.now() - runStart) / 1000), 100);
		phase = "recording";
		void keepAwake();
	}

	function pause() {
		if (!recorder || phase !== "recording") return;
		recorder.pause();
		runBase += (performance.now() - runStart) / 1000;
		if (tick) clearInterval(tick);
		tick = null;
		elapsed = runBase;
		phase = "paused";
	}

	function resume() {
		if (!recorder || phase !== "paused") return;
		recorder.resume();
		runStart = performance.now();
		tick = setInterval(() => (elapsed = runBase + (performance.now() - runStart) / 1000), 100);
		phase = "recording";
	}

	function stop() {
		if (!recorder || (phase !== "recording" && phase !== "paused")) return;
		if (phase === "recording") runBase += (performance.now() - runStart) / 1000;
		if (tick) clearInterval(tick);
		tick = null;
		elapsed = runBase;
		recorder.stop(); // finishTake() runs from onstop once the last chunk is in
	}

	function onTrackEnded() {
		if (phase === "recording" || phase === "paused") {
			notice = "The microphone stopped (a call, or the input went away). The take so far is kept.";
			stop();
		}
	}

	function finishTake() {
		stopStream();
		const blob = new Blob(chunks, { type: format?.mimeType ?? "application/octet-stream" });
		chunks = [];
		if (blob.size === 0 || elapsed < 0.5) {
			notice = "Nothing was recorded.";
			phase = "idle";
			return;
		}
		take = blob;
		takeUrl = URL.createObjectURL(blob);
		if (!title) title = defaultTitle();
		phase = "reviewing";
	}

	/** Undo: throw the take away (while recording, paused or reviewing) and start over. */
	function retake() {
		if (phase === "recording" || phase === "paused") {
			if (elapsed > 3 && !confirm("Throw away this take?")) return;
			if (recorder) {
				recorder.onstop = null;
				recorder.stop();
			}
			if (tick) clearInterval(tick);
			tick = null;
			stopStream();
			chunks = [];
		} else if (phase === "reviewing") {
			if (!confirm("Throw away this take?")) return;
		}
		discardTake();
		elapsed = 0;
		phase = "idle";
	}

	function discardTake() {
		if (takeUrl) URL.revokeObjectURL(takeUrl);
		takeUrl = null;
		take = null;
	}

	async function save() {
		if (!take || !format) return;
		phase = "saving";
		progress = 0;
		const name = (title.trim() || defaultTitle()).slice(0, 120);
		const file = new File([take], `${name.replace(/[^\w.-]+/g, "-").toLowerCase()}.${format.ext}`, {
			type: format.mimeType,
		});
		const duration = elapsed;
		try {
			const id = await uploadRecordingFile(
				file,
				() =>
					postJson<RecordingReservation>("/api/recordings", {
						accountId,
						title: name,
						filename: file.name,
						sizeBytes: file.size,
					}),
				duration,
				(percent) => (progress = percent),
			);
			discardTake();
			elapsed = 0;
			title = "";
			phase = "idle";
			onsaved({ id, title: name });
		} catch (e) {
			notice = `The recording could not be saved: ${errorMessage(e)}. It is still here; try again.`;
			phase = "reviewing";
		}
	}

	function startMeter(s: MediaStream) {
		ctx = new AudioContext();
		const source = ctx.createMediaStreamSource(s);
		analyser = ctx.createAnalyser();
		analyser.fftSize = 1024;
		source.connect(analyser); // not to the destination: no monitoring through the speaker
		const buf = new Float32Array(analyser.fftSize);
		let hold = 0;
		const loop = () => {
			if (!analyser) return;
			analyser.getFloatTimeDomainData(buf);
			let sum = 0;
			let max = 0;
			for (const x of buf) {
				sum += x * x;
				if (Math.abs(x) > max) max = Math.abs(x);
			}
			level = Math.min(1, Math.sqrt(sum / buf.length) * 3);
			if (max >= hold) hold = max;
			else hold = Math.max(max, hold - 0.01);
			peak = hold;
			meterFrame = requestAnimationFrame(loop);
		};
		meterFrame = requestAnimationFrame(loop);
	}

	function stopStream() {
		cancelAnimationFrame(meterFrame);
		analyser = null;
		void ctx?.close();
		ctx = null;
		for (const t of stream?.getTracks() ?? []) t.stop();
		stream = null;
		recorder = null;
		level = 0;
		peak = 0;
		void wakeLock?.release();
		wakeLock = null;
	}

	/** Keeps a phone's screen on mid-take (iOS stops recording when it sleeps). */
	async function keepAwake() {
		try {
			wakeLock = (await navigator.wakeLock?.request("screen")) ?? null;
		} catch {
			wakeLock = null; // not granted or not supported: the take still records while the screen is on
		}
	}

	// Runs on the server too (SSR): only touch browser APIs when a take was started.
	onDestroy(() => {
		if (tick) clearInterval(tick);
		if (recorder && recorder.state !== "inactive") {
			recorder.onstop = null;
			recorder.stop();
		}
		if (stream) stopStream();
		discardTake();
	});

	const busy = $derived(phase === "recording" || phase === "paused" || phase === "reviewing");
</script>

<svelte:window
	onbeforeunload={(e) => {
		if (busy) e.preventDefault();
	}}
/>

<div class="grid gap-5">
	{#if !supported}
		<p class="rounded border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm" role="alert">
			This browser cannot record audio. Try Safari, Chrome or Firefox.
		</p>
	{/if}

	<!-- the clock and the meter -->
	<div class="surface grid gap-4 px-5 py-5">
		<div class="flex flex-wrap items-baseline justify-between gap-3">
			<span class="font-mono text-40px leading-none tabular-nums sm:text-56px" aria-live="off"
				>{formatTime(elapsed, 1)}</span
			>
			<span class="text-sm opacity-90">
				{#if phase === "recording"}
					<span class="mr-1 inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-red-500"
					></span>Recording
				{:else if phase === "paused"}
					Paused
				{:else if phase === "reviewing"}
					Take ready
				{:else if phase === "saving"}
					Saving… {Math.round(progress)}%
				{:else if phase === "requesting"}
					Waiting for the microphone…
				{:else}
					Ready
				{/if}
			</span>
		</div>
		<div
			class="relative h-3 overflow-hidden rounded bg-black/40"
			role="meter"
			aria-label="Input level"
			aria-valuemin="0"
			aria-valuemax="100"
			aria-valuenow={Math.round(level * 100)}
		>
			<div
				class="h-full rounded {level > 0.85 ? 'bg-red-500' : 'bg-maximumYellow'}"
				style:width="{level * 100}%"
			></div>
			<div
				class="absolute top-0 h-full w-0.5 {peak > 0.98 ? 'bg-red-500' : 'bg-white/70'}"
				style:left="{Math.min(99.5, peak * 100)}%"
			></div>
		</div>
		{#if inputLabel && (phase === "recording" || phase === "paused")}
			<p class="text-12px opacity-70">Input: {inputLabel}</p>
		{/if}
	</div>

	{#if notice}
		<p class="rounded border border-white/15 bg-blue-300/5 px-4 py-3 text-sm" role="status">
			{notice}
		</p>
	{/if}

	<!-- the controls -->
	{#if phase === "idle" || phase === "requesting"}
		<div class="flex flex-wrap items-center gap-3">
			<button
				class="button-accent text-18px px-6 py-3"
				type="button"
				disabled={!supported || phase === "requesting"}
				onclick={start}
			>
				<span class="i-ph-record-fill text-red-500" aria-hidden="true"></span>
				Record
			</button>
		</div>
	{:else if phase === "recording" || phase === "paused"}
		<div class="flex flex-wrap items-center gap-3">
			{#if phase === "recording"}
				<button class="button text-16px px-5 py-2.5" type="button" onclick={pause}>
					<span class="i-ph-pause-fill" aria-hidden="true"></span>
					Pause
				</button>
			{:else}
				<button class="button-accent text-16px px-5 py-2.5" type="button" onclick={resume}>
					<span class="i-ph-record-fill text-red-500" aria-hidden="true"></span>
					Resume
				</button>
			{/if}
			<button class="button-accent text-16px px-5 py-2.5" type="button" onclick={stop}>
				<span class="i-ph-stop-fill" aria-hidden="true"></span>
				Stop
			</button>
			<button
				class="button text-16px px-5 py-2.5"
				type="button"
				title="Throw this take away and start over"
				onclick={retake}
			>
				<span class="i-ph-arrow-counter-clockwise" aria-hidden="true"></span>
				Undo
			</button>
		</div>
	{:else if phase === "reviewing" || phase === "saving"}
		<div class="grid gap-4">
			{#if takeUrl}
				<!-- svelte-ignore a11y_media_has_caption -->
				<audio class="w-full" controls preload="auto" src={takeUrl}></audio>
			{/if}
			<label class="block">
				<span class="text-sm opacity-90">Title</span>
				<input
					class="mt-1 field"
					type="text"
					maxlength="120"
					autocomplete="off"
					data-1p-ignore
					data-lpignore="true"
					data-bwignore
					bind:value={title}
					disabled={phase === "saving"}
				/>
			</label>
			<div class="flex flex-wrap items-center gap-3">
				<button
					class="button-accent text-16px px-5 py-2.5"
					type="button"
					disabled={phase === "saving"}
					onclick={save}
				>
					<span class="i-ph-floppy-disk" aria-hidden="true"></span>
					{phase === "saving" ? `Saving… ${Math.round(progress)}%` : "Save"}
				</button>
				<button
					class="button text-16px px-5 py-2.5"
					type="button"
					disabled={phase === "saving"}
					onclick={retake}
				>
					<span class="i-ph-arrow-counter-clockwise" aria-hidden="true"></span>
					Retake
				</button>
			</div>
		</div>
	{/if}
</div>
