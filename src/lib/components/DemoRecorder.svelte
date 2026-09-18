<script lang="ts">
	import { postJson, saveAs, uploadRecordingFile, type RecordingReservation } from "$lib/upload";
	import { notify } from "$lib/state/notifications.svelte";
	import { errorMessage } from "$lib/utils/errorMessage";
	import { formatTime } from "$lib/utils/formatTime";
	import { recordingMimeType } from "$lib/utils/recordingMimeType";
	import { onDestroy } from "svelte";

	/**
	 * The Idea Recorder's take recorder (docs/demo-recording.md). Record
	 * starts a take of the current idea; Stop completes it and saves it at
	 * once as the next numbered take, which stays loaded for playback. Record
	 * again starts the next take. The page owns the idea (title, notes, the
	 * list) and hands the recorder an idea id when a take needs one.
	 */
	export interface Take {
		id: string;
		takeNumber: number;
		/** The take's own name; "" shows as "Take N". */
		title: string;
		url: string;
		durationSeconds: number | null;
	}
	interface Props {
		/** The idea's title, shown and edited in the panel (the page saves it). */
		ideaTitle: string;
		/** The id of the idea a take belongs to, creating the idea if there is none yet. */
		ensureIdea: () => Promise<string>;
		onsaved: (take: Take) => void;
		/** The idea's title was edited (blur or Enter). */
		ontitlechange: (title: string) => void;
		/** The loaded take's name was edited (blur or Enter). */
		ontakename?: (take: { id: string; title: string }) => void;
		/** Delete the loaded take (from the ⋯ menu). */
		ondeletetake?: (take: Take) => void;
		/** The loaded take into a song (the page opens its popover). */
		onaddtosong?: (take: Take) => void;
		onnewsong?: (take: Take) => void;
		/** Delete the whole idea (from the ⋯ menu). */
		ondeleteidea?: () => void;
		/** A new take is starting. */
		onstart?: () => void;
		/** Every phase change, so the page can freeze its list mid-take. */
		onphase?: (phase: Phase) => void;
	}
	let {
		ideaTitle = $bindable(),
		ensureIdea,
		onsaved,
		ontitlechange,
		ontakename,
		ondeletetake,
		onaddtosong,
		onnewsong,
		ondeleteidea,
		onstart,
		onphase,
	}: Props = $props();

	type Phase = "idle" | "requesting" | "recording" | "saving" | "saved";
	let phase = $state<Phase>("idle");
	let elapsed = $state(0);
	let level = $state(0);
	let peak = $state(0);
	let notice = $state<string | null>(null);
	let progress = $state(0);
	let inputLabel = $state<string | null>(null);
	/** The take in the player: just recorded here, or loaded from the list. */
	let loaded = $state<Take | null>(null);
	let takeName = $state("");
	let take: Blob | null = null;
	let takeUrl = $state<string | null>(null);
	/** Playback through our own controls (the browser's player is hidden). */
	let playbackPaused = $state(true);
	let playhead = $state(0);
	let volume = $state(1);
	let menuEl = $state<HTMLDetailsElement | null>(null);

	let stream: MediaStream | null = null;
	let recorder: MediaRecorder | null = null;
	let chunks: Blob[] = [];
	let format: { mimeType: string; ext: string } | null = null;
	let ctx: AudioContext | null = null;
	let analyser: AnalyserNode | null = null;
	let meterFrame = 0;
	let wakeLock: WakeLockSentinel | null = null;
	let runStart = 0;
	let tick: ReturnType<typeof setInterval> | null = null;

	const supported = typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
	const hasTake = $derived(phase === "saved" || phase === "saving");
	const busy = $derived(phase === "recording" || phase === "requesting" || phase === "saving");

	function setPhase(next: Phase) {
		phase = next;
		onphase?.(next);
	}

	async function start() {
		if (busy) return;
		notice = null;
		format = recordingMimeType((t) => MediaRecorder.isTypeSupported(t));
		if (!format) {
			notice = "This browser cannot record audio. Try Safari, Chrome or Firefox.";
			return;
		}
		// The previous take leaves the player; it is in the list.
		playbackPaused = true;
		discardTake();
		loaded = null;
		takeName = "";
		elapsed = 0;
		onstart?.();
		setPhase("requesting");
		try {
			// The three voice processors are on by default and ruin an instrument.
			stream = await navigator.mediaDevices.getUserMedia({
				audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
			});
		} catch (e) {
			setPhase("idle");
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
		recorder.onstop = () => void finishTake();
		recorder.start(1000);
		runStart = performance.now();
		elapsed = 0;
		tick = setInterval(() => (elapsed = (performance.now() - runStart) / 1000), 100);
		setPhase("recording");
		void keepAwake();
	}

	/** Stop completes the take: it is saved as the idea's next numbered take. */
	function stop() {
		if (!recorder || phase !== "recording") return;
		elapsed = (performance.now() - runStart) / 1000;
		if (tick) clearInterval(tick);
		tick = null;
		recorder.stop(); // finishTake() runs from onstop once the last chunk is in
	}

	function onTrackEnded() {
		if (phase === "recording") {
			notice = "The microphone stopped (a call, or the input went away). The take so far is saved.";
			stop();
		}
	}

	async function finishTake() {
		stopStream();
		const blob = new Blob(chunks, { type: format?.mimeType ?? "application/octet-stream" });
		chunks = [];
		if (blob.size === 0 || elapsed < 0.5) {
			notice = "Nothing was recorded.";
			setPhase("idle");
			return;
		}
		take = blob;
		takeUrl = URL.createObjectURL(blob);
		await save();
	}

	async function save() {
		if (!take || !format) return;
		setPhase("saving");
		progress = 0;
		const duration = elapsed;
		const name = takeName.trim().slice(0, 120);
		const file = new File([take], `take-${Date.now().toString(36)}.${format.ext}`, {
			type: format.mimeType,
		});
		try {
			const ideaId = await ensureIdea();
			const { recordingId, takeNumber } = await uploadRecordingFile(
				file,
				() =>
					postJson<RecordingReservation>("/api/recordings", {
						ideaId,
						title: name,
						filename: file.name,
						sizeBytes: file.size,
					}),
				duration,
				(percent) => (progress = percent),
			);
			loaded = {
				id: recordingId,
				takeNumber,
				title: name,
				url: takeUrl ?? "",
				durationSeconds: duration,
			};
			playbackPaused = true;
			setPhase("saved");
			onsaved(loaded);
		} catch (e) {
			notice = `The take could not be saved: ${errorMessage(e)}. Record it again.`;
			discardTake();
			setPhase("idle");
		}
	}

	/** Show a take from the list: its file plays on demand; Record starts the next take. */
	export function load(t: Take) {
		if (busy) return;
		playbackPaused = true;
		discardTake();
		takeUrl = t.url;
		loaded = t;
		takeName = t.title;
		elapsed = t.durationSeconds ?? 0;
		notice = null;
		setPhase("saved");
	}
	/** An empty player (New idea, or after a delete). */
	export function reset() {
		if (busy) return;
		playbackPaused = true;
		discardTake();
		loaded = null;
		takeName = "";
		elapsed = 0;
		notice = null;
		setPhase("idle");
	}

	function discardTake() {
		if (takeUrl?.startsWith("blob:")) URL.revokeObjectURL(takeUrl);
		takeUrl = null;
		take = null;
	}

	function togglePlayback() {
		if (!hasTake) return;
		playbackPaused = !playbackPaused;
	}
	function closeMenu(e: Event) {
		if (menuEl?.open && !(e.type === "pointerdown" && menuEl.contains(e.target as Node))) {
			menuEl.open = false;
		}
	}
	/** "<idea> - take 3.m4a", the take's extension (a loaded file's from its URL). */
	function downloadName() {
		const fromUrl = takeUrl?.startsWith("blob:")
			? null
			: takeUrl?.match(/\.([a-z0-9]+)(?:$|\?)/i)?.[1];
		const ext = take ? (format?.ext ?? "webm") : (fromUrl ?? "m4a");
		const base = `${ideaTitle.trim() || "idea"} - take ${loaded?.takeNumber ?? 1}${takeName.trim() ? ` - ${takeName.trim()}` : ""}`;
		return `${base.replace(/[^\w.-]+/g, "-").toLowerCase()}.${ext}`;
	}
	async function download() {
		if (menuEl) menuEl.open = false;
		if (!takeUrl) return;
		try {
			if (take) {
				const a = document.createElement("a");
				a.href = takeUrl;
				a.download = downloadName();
				a.click();
			} else await saveAs(takeUrl, downloadName());
		} catch (e) {
			notify(`Download failed: ${errorMessage(e)}`, { kind: "error" });
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
			wakeLock = null;
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
		src={takeUrl}
		bind:paused={playbackPaused}
		bind:currentTime={playhead}
		bind:volume
		preload="auto"
		onended={() => (playbackPaused = true)}
	></audio>
{/if}

<div
	class="grid grid-cols-1 place-content-start gap-4 bg-blue-300/5 border border-current/40 px-5 py-5 rounded-md"
>
	<!-- the idea's title and, once there is a take, its number and name -->
	<div class="grid gap-2">
		<label class="block">
			<span class="sr-only">Idea title</span>
			<input
				class="field text-18px font-600"
				type="text"
				maxlength="120"
				autocomplete="off"
				data-1p-ignore
				data-lpignore="true"
				data-bwignore
				bind:value={ideaTitle}
				disabled={phase === "saving"}
				onchange={() => ontitlechange(ideaTitle.trim())}
				onkeydown={(e) => {
					if (e.key === "Enter") e.currentTarget.blur();
				}}
			/>
		</label>
		<label class="grid grid-cols-[auto_1fr] items-center gap-3 text-sm">
			<span class="font-mono opacity-90 whitespace-nowrap">
				{#if phase === "recording"}
					New take
				{:else if loaded}
					Take {loaded.takeNumber}
				{:else}
					No take yet
				{/if}
			</span>
			<input
				class="field text-sm"
				type="text"
				maxlength="120"
				placeholder={loaded ? "Name this take (optional)" : ""}
				autocomplete="off"
				data-1p-ignore
				data-lpignore="true"
				data-bwignore
				bind:value={takeName}
				disabled={!loaded || phase === "saving"}
				aria-label="Take name"
				onchange={() => {
					if (loaded) ontakename?.({ id: loaded.id, title: takeName.trim() });
				}}
				onkeydown={(e) => {
					if (e.key === "Enter") e.currentTarget.blur();
				}}
			/>
		</label>
	</div>
	{#if !supported}
		<p class="rounded border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm" role="alert">
			This browser cannot record audio. Try Safari, Chrome or Firefox.
		</p>
	{/if}

	<!-- the clock and the meter -->
	<div class="bg-black/40 px-3 py-2 leading-none grid grid-cols-[auto_1fr] gap-4 lg-gap-8 relative">
		<div class="rounded-md grid grid-cols-1 gap-2">
			<span
				class="font-mono text-28px sm-text-34px md-text-38px lg-text-44px leading-none tabular-nums"
				aria-live="off">{formatTime(hasTake && !playbackPaused ? playhead : elapsed, 1)}</span
			>
			<div class="text-sm opacity-90 font-mono">
				{#if phase === "recording"}
					<span class="mr-2 inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-red-500"
					></span>Recording
				{:else if hasTake && !playbackPaused}
					<span class="mr-2 inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-green-500"
					></span>Playing
				{:else if phase === "saving"}
					<span class="mr-3 inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-orange-500"
					></span>Saving… {Math.round(progress)}%
				{:else if phase === "saved"}
					<span class="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-green-500"></span>Saved
				{:else if phase === "requesting"}
					<span class="mr-2 inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-green-500"
					></span>Waiting for the microphone…
				{:else}
					<span class="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-green-500"></span>Ready
				{/if}
			</div>
		</div>

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
			{#if inputLabel && phase === "recording"}
				<p class="text-12px opacity-70 text-truncate w-full">Input: {inputLabel}</p>
			{/if}
		</div>
	</div>

	{#if notice}
		<p class="rounded border border-white/15 bg-blue-300/5 px-4 py-3 text-sm" role="status">
			{notice}
		</p>
	{/if}

	<!-- the controls: Record (or Stop), Play, the take menu -->
	<div class="flex flex-wrap items-center gap-3">
		{#if phase === "recording"}
			<button class="button-record" type="button" onclick={stop}>
				<span class="i-ph-stop-fill" aria-hidden="true"></span>
				Stop
			</button>
		{:else}
			<button
				class="button-record"
				type="button"
				disabled={!supported || busy}
				title={loaded ? "Record the next take" : "Record a take"}
				onclick={start}
			>
				<span class="i-ph-record-fill" aria-hidden="true"></span>
				Record
			</button>
		{/if}
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
				{#if phase === "saved" && loaded}
					<button
						class="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-white/10"
						type="button"
						role="menuitem"
						onclick={() => {
							if (menuEl) menuEl.open = false;
							if (loaded) onaddtosong?.(loaded);
						}}
					>
						<span class="i-ph-plus" aria-hidden="true"></span>Add as demo…
					</button>
					<button
						class="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-white/10"
						type="button"
						role="menuitem"
						onclick={() => {
							if (menuEl) menuEl.open = false;
							if (loaded) onnewsong?.(loaded);
						}}
					>
						<span class="i-ph-music-notes-plus" aria-hidden="true"></span>Create new song…
					</button>
					<button
						class="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-white/10"
						type="button"
						role="menuitem"
						onclick={download}
					>
						<span class="i-ph-download-simple" aria-hidden="true"></span>Download
					</button>
					<hr class="my-1 border-white/15" />
					<button
						class="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-red-400 hover:bg-white/10"
						type="button"
						role="menuitem"
						onclick={() => {
							if (menuEl) menuEl.open = false;
							if (loaded) ondeletetake?.(loaded);
						}}
					>
						<span class="i-ph-trash" aria-hidden="true"></span>Delete take
					</button>
				{/if}
				{#if ondeleteidea && (phase === "saved" || phase === "idle")}
					<button
						class="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-red-400 hover:bg-white/10"
						type="button"
						role="menuitem"
						onclick={() => {
							if (menuEl) menuEl.open = false;
							ondeleteidea?.();
						}}
					>
						<span class="i-ph-trash" aria-hidden="true"></span>Delete idea
					</button>
				{:else if phase !== "saved"}
					<div class="px-2 py-1 text-xs opacity-70">Nothing to do here yet</div>
				{/if}
			</div>
		</details>
	</div>
</div>
