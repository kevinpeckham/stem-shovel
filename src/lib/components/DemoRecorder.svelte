<script lang="ts">
	import { postJson, uploadRecordingFile, type RecordingReservation } from "$lib/upload";
	import { errorMessage } from "$lib/utils/errorMessage";
	import { formatTime } from "$lib/utils/formatTime";
	import { recordingMimeType } from "$lib/utils/recordingMimeType";
	import { onDestroy, onMount } from "svelte";

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
		/** Notes written before the take was saved; stored with the recording. */
		getNotes?: () => string;
	}
	let { accountId, onsaved, getNotes }: Props = $props();

	type Phase = "idle" | "requesting" | "recording" | "paused" | "reviewing" | "saving" | "saved";
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
	/** Playback of the take, through our own controls (the browser's player is hidden). */
	let audio = $state<HTMLAudioElement | null>(null);
	let playbackPaused = $state(true);
	let playhead = $state(0);
	let volume = $state(1);
	let menuEl = $state<HTMLDetailsElement | null>(null);
	/** A take exists to play: reviewing, saving or saved. */
	const hasTake = $derived(phase === "reviewing" || phase === "saving" || phase === "saved");
	/** The file name a download gets: the title, made safe, plus the take's extension. */
	const downloadName = () =>
		`${(title.trim() || "recording").replace(/[^\w.-]+/g, "-").toLowerCase()}.${format?.ext ?? "webm"}`;
	function togglePlayback() {
		if (!hasTake) return;
		playbackPaused = !playbackPaused;
	}
	function closeMenu(e: Event) {
		if (menuEl?.open && !(e.type === "pointerdown" && menuEl.contains(e.target as Node))) {
			menuEl.open = false;
		}
	}

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

	/** "Untitled - Sep 18, 2026 - 3:45 pm", in the browser's clock; the field shows it from the start and stays editable. */
	function defaultTitle() {
		const now = new Date();
		const day = now.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
		});
		const time = now
			.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
			.toLowerCase();
		return `Untitled - ${day} - ${time}`;
	}
	// In the browser, not at render: the server's clock and time zone are not the user's.
	onMount(() => {
		title = defaultTitle();
	});
	/** Save pressed while paused: the take is stopped first, then saved as soon as it is ready. */
	let saveAfterStop = false;

	async function start() {
		notice = null;
		format = recordingMimeType((t) => MediaRecorder.isTypeSupported(t));
		if (!format) {
			notice = "This browser cannot record audio. Try Safari, Chrome or Firefox.";
			return;
		}
		// A new take after a saved one: the old file goes, the row starts fresh.
		if (phase === "saved") {
			playbackPaused = true;
			discardTake();
			elapsed = 0;
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
		if (saveAfterStop) {
			saveAfterStop = false;
			void save();
		}
	}

	/** The Save button: from paused, stop and then save; from reviewing, save. */
	function saveNow() {
		if (phase === "paused") {
			saveAfterStop = true;
			stop();
		} else if (phase === "reviewing") {
			void save();
		}
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
						notes: getNotes?.() ?? "",
						filename: file.name,
						sizeBytes: file.size,
					}),
				duration,
				(percent) => (progress = percent),
			);
			// The take stays playable and downloadable until the next one starts.
			playbackPaused = true;
			phase = "saved";
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
	onpointerdown={closeMenu}
	onkeydown={(e) => {
		if (e.key === "Escape") closeMenu(e);
	}}
/>

{#if takeUrl && hasTake}
	<!-- svelte-ignore a11y_media_has_caption -->
	<audio
		bind:this={audio}
		src={takeUrl}
		bind:paused={playbackPaused}
		bind:currentTime={playhead}
		bind:volume
		preload="auto"
		onended={() => (playbackPaused = true)}
	></audio>
{/if}

<div
	class="grid grid-cols-1 place-content-start gap-5 bg-blue-300/5 border border-current/40 px-5 py-5 rounded-md h-full min-h-560px"
>
	<label class="block">
		<span class="sr-only">Title</span>
		<input
			class="field"
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
	{#if !supported}
		<p class="rounded border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm" role="alert">
			This browser cannot record audio. Try Safari, Chrome or Firefox.
		</p>
	{/if}

	<!-- the clock and the meter -->
	<div class="bg-black/40 px-3 py-2 leading-none grid grid-cols-[auto_1fr] gap-4 lg-gap-8 relative">
		<!-- clock and status -->
		<div class="rounded-md grid grid-cols-1 gap-2">
			<span
				class="font-mono text-28px sm-text-34px md-text-38px lg-text-44px leading-none tabular-nums"
				aria-live="off">{formatTime(hasTake && !playbackPaused ? playhead : elapsed, 1)}</span
			>
			<div class="text-sm opacity-90 font-mono">
				{#if phase === "recording"}
					<span class="mr-2 inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-red-500"
					></span>Recording
				{:else if phase === "paused"}
					<span class="mr-3 inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-yellow-500"
					></span>Paused
				{:else if hasTake && !playbackPaused}
					<span class="mr-2 inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-green-500"
					></span>Playing
				{:else if phase === "reviewing"}
					<span class="mr-2 inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-green-500"
					></span>Take ready
				{:else if phase === "saved"}
					<span class="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-green-500"></span>Saved
				{:else if phase === "saving"}
					<span class="mr-3 inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-orange-500"
					></span>Saving… {Math.round(progress)}%
				{:else if phase === "requesting"}
					<span class="mr-2 inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-green-500"
					></span>Waiting for the microphone…
				{:else}
					<span class="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-green-500"></span>Ready
				{/if}
			</div>
		</div>

		<!-- meter and input label -->
		<div class="rounded grid grid-cols-1 gap-3 place-content-start max-w-300px">
			<div
				class="mt-3 w-full relative z-10 grid grid-cols-[auto_1fr] gap-2"
				role="meter"
				aria-label="Input level"
				aria-valuemin="0"
				aria-valuemax="100"
				aria-valuenow={Math.round(level * 100)}
			>
				<span class="i-ph-microphone flex" aria-hidden="true"></span>
				<div class="relative h-3 overflow-hidden rounded bg-blue-300/10">
					<div
						class="h-full rounded {level > 0.85 ? 'bg-red-500' : 'bg-maximumYellow'}"
						style:width="{level * 100}%"
					></div>
					<div
						class="absolute top-0 h-full w-0.5 {peak > 0.98 ? 'bg-red-500' : 'bg-white/70'}"
						style:left="{Math.min(99.5, peak * 100)}%"
					></div>
				</div>
			</div>

			<label class="w-full grid grid-cols-[auto_1fr] items-center gap-2 text-sm opacity-90">
				<span class="i-ph-speaker-high" aria-hidden="true"></span>
				<span class="sr-only">Volume</span>
				<input
					type="range"
					class="accent-blue-300"
					min="0"
					max="1"
					step="0.01"
					bind:value={volume}
					aria-label="Volume"
				/>
			</label>

			{#if inputLabel && (phase === "recording" || phase === "paused")}
				<p class="text-12px opacity-70 w-ful text-truncate w-full">Input: {inputLabel}</p>
			{/if}
		</div>
	</div>

	{#if notice}
		<p class="rounded border border-white/15 bg-blue-300/5 px-4 py-3 text-sm" role="status">
			{notice}
		</p>
	{/if}

	<!-- the controls: one row that never changes shape; a button is greyed out until it applies -->
	<div class="flex flex-wrap items-center gap-3">
		<!-- record / pause -->
		{#if phase === "recording"}
			<button class="button-record" type="button" onclick={pause}>
				<span class="i-ph-pause-fill" aria-hidden="true"></span>
				Pause
			</button>
		{:else if phase === "paused"}
			<button class="button-record" type="button" onclick={resume}>
				<span class="i-ph-record-fill" aria-hidden="true"></span>
				Resume
			</button>
		{:else}
			<button
				class="button-record"
				type="button"
				disabled={!supported || (phase !== "idle" && phase !== "saved")}
				title={phase === "reviewing"
					? "Retake first to record again"
					: phase === "saved"
						? "Start the next take (this one is saved)"
						: "Start a take"}
				onclick={start}
			>
				<span class="i-ph-record-fill" aria-hidden="true"></span>
				Record
			</button>
		{/if}

		<!-- play / stop -->
		<button
			class="button button-sm"
			type="button"
			disabled={!hasTake}
			aria-label={playbackPaused ? "Play the take" : "Pause the take"}
			title={playbackPaused ? "Play the take" : "Pause the take"}
			onclick={togglePlayback}
		>
			<span class={playbackPaused ? "i-ph-play-fill" : "i-ph-pause-fill"} aria-hidden="true"></span>
			{playbackPaused ? "Play" : "Pause"}
		</button>
		<button
			class="button button-sm"
			type="button"
			disabled={phase !== "recording" && phase !== "paused"}
			onclick={stop}
		>
			<span class="i-ph-stop-fill" aria-hidden="true"></span>
			Stop
		</button>
		<button
			class="button button-sm"
			type="button"
			disabled={phase !== "recording" && phase !== "paused" && phase !== "reviewing"}
			title={phase === "reviewing"
				? "Throw this take away and record another"
				: "Throw away what has been recorded so far"}
			onclick={retake}
		>
			<span class="i-ph-arrow-counter-clockwise" aria-hidden="true"></span>
			{phase === "reviewing" ? "Retake" : "Undo"}
		</button>
		<button
			class="button button-sm"
			type="button"
			disabled={phase !== "paused" && phase !== "reviewing"}
			title={phase === "paused" ? "Stop the take and save it" : "Save the take"}
			onclick={saveNow}
		>
			<span class="i-ph-floppy-disk" aria-hidden="true"></span>
			{phase === "saving" ? `Saving… ${Math.round(progress)}%` : "Save"}
		</button>

		<details class="relative ml-auto" bind:this={menuEl}>
			<summary
				class="button button-sm flex items-center list-none !min-h-31px [&::-webkit-details-marker]:hidden"
				title="More"
				aria-label="Take menu"
			>
				<span class="i-ph-dots-three-outline-vertical-fill" aria-hidden="true"></span>
			</summary>
			<div
				class="absolute top-full right-0 z-20 mt-1 min-w-48 rounded border border-white/15 bg-oxford p-1 text-sm shadow-lg"
				role="menu"
			>
				{#if phase === "saved" && takeUrl}
					<a
						class="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-white/10"
						role="menuitem"
						href={takeUrl}
						download={downloadName()}
						onclick={() => {
							if (menuEl) menuEl.open = false;
						}}
					>
						<span class="i-ph-download-simple" aria-hidden="true"></span>Download
					</a>
				{:else}
					<div class="px-2 py-1 text-xs opacity-70">
						{hasTake ? "Save the take to download it" : "Nothing to do here yet"}
					</div>
				{/if}
			</div>
		</details>
	</div>
</div>
