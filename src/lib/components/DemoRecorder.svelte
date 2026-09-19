<script lang="ts">
	import { RECORDING_BITS_PER_SECOND, SILENCE_LEVEL } from "$lib/constants/takeLimits";
	import {
		takeStopNotice,
		takeStopReason,
		takeWarningDue,
		takeWarningNotice,
		type TakeStopReason,
	} from "$lib/utils/takeStopReason";
	import { saveAs } from "$lib/upload";
	import { notify } from "$lib/state/notifications.svelte";
	import { errorMessage } from "$lib/utils/errorMessage";
	import { formatTime } from "$lib/utils/formatTime";
	import { recordingMimeType } from "$lib/utils/recordingMimeType";
	import { onDestroy } from "svelte";

	/**
	 * The Idea Recorder's take recorder (docs/demo-recording.md). Record
	 * starts a take of the current idea; Stop completes it and hands it to
	 * the page's upload queue at once, so Record is available immediately;
	 * the take stays loaded for playback and gets its number when the upload
	 * lands. The page owns the idea (title, notes, the list) and the queue.
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
		/** A stopped take, with its audio: the page queues the upload. */
		onqueued: (take: {
			localId: string;
			blob: Blob;
			mimeType: string;
			ext: string;
			name: string;
			durationSeconds: number;
		}) => void;
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
		/** Start a new idea (from the ⋯ menu); `newIdeaDisabled` when there is nothing to leave. */
		onnewidea?: () => void;
		newIdeaDisabled?: boolean;
		/** The idea's takes, so the "Take N" label can jump between them. */
		takes?: Take[];
		/** A take chosen from the label's dropdown. */
		onpick?: (take: Take) => void;
		/** A new take is starting. */
		onstart?: () => void;
		/** Every phase change, so the page can freeze its list mid-take. */
		onphase?: (phase: Phase) => void;
		/** Drop a take shorter than this many seconds (a mis-tap) instead of saving it; 0 keeps every take. */
		minTakeSeconds?: number;
	}
	let {
		ideaTitle = $bindable(),
		onqueued,
		ontitlechange,
		ontakename,
		ondeletetake,
		onaddtosong,
		onnewsong,
		ondeleteidea,
		onnewidea,
		newIdeaDisabled = false,
		takes = [],
		onpick,
		onstart,
		onphase,
		minTakeSeconds = 0,
	}: Props = $props();
	let takeMenuEl = $state<HTMLDetailsElement | null>(null);
	/** iPhone, iPod, and iPad (which reports itself as a Mac with touch). */
	const onIOS =
		typeof navigator !== "undefined" &&
		(/iP(hone|ad|od)/.test(navigator.platform) ||
			(navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

	type Phase = "idle" | "requesting" | "recording" | "saved";
	/** A just-stopped take is `local:<id>` until the upload lands and the page resolves it. */
	const isLocal = (id: string) => id.startsWith("local:");
	let phase = $state<Phase>("idle");
	let elapsed = $state(0);
	let level = $state(0);
	let peak = $state(0);
	let notice = $state<string | null>(null);
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
	/** Silence watch: when the input was last above SILENCE_LEVEL, and whether it ever was. */
	let lastLoudAt = 0;
	let everLoud = false;
	let warned = false;
	/** Why the take is stopping on its own, read by finishTake. */
	let stopReason: TakeStopReason | null = null;

	const supported = typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
	const hasTake = $derived(phase === "saved");
	const busy = $derived(phase === "recording" || phase === "requesting");

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
		// The previous take leaves the player; it is in the list. Its name goes
		// with it; a name typed with no take loaded is for this one.
		playbackPaused = true;
		discardTake();
		if (loaded) takeName = "";
		loaded = null;
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
		recorder = new MediaRecorder(stream, {
			mimeType: format.mimeType,
			audioBitsPerSecond: RECORDING_BITS_PER_SECOND,
		});
		recorder.ondataavailable = (e) => {
			if (e.data.size > 0) chunks.push(e.data);
		};
		recorder.onstop = () => void finishTake();
		recorder.start(1000);
		runStart = performance.now();
		lastLoudAt = runStart;
		everLoud = false;
		warned = false;
		stopReason = null;
		elapsed = 0;
		tick = setInterval(watch, 100);
		setPhase("recording");
		void keepAwake();
	}

	/**
	 * Every 100 ms while recording: the clock, and the two ceilings (the time
	 * limit, a stretch of silence) that stop a take left running. The level is
	 * sampled here as well as in the meter, since a background tab throttles
	 * animation frames but keeps timers.
	 */
	function watch() {
		const now = performance.now();
		elapsed = (now - runStart) / 1000;
		if (sampleLevel() > SILENCE_LEVEL) {
			lastLoudAt = now;
			everLoud = true;
		}
		if (!warned && takeWarningDue(elapsed)) {
			warned = true;
			notice = takeWarningNotice();
		}
		const reason = takeStopReason(elapsed, (now - lastLoudAt) / 1000, everLoud);
		if (reason) {
			stopReason = reason;
			notice = takeStopNotice(reason);
			stop();
		}
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
		if (stopReason === "silent") {
			setPhase("idle"); // the notice already says the take was discarded
			return;
		}
		if (elapsed < minTakeSeconds) {
			notice = `Take discarded: shorter than ${minTakeSeconds} seconds (Recorder settings).`;
			setPhase("idle");
			return;
		}
		take = blob;
		takeUrl = URL.createObjectURL(blob);
		const localId = `local:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
		loaded = {
			id: localId,
			takeNumber: 0,
			title: takeName.trim().slice(0, 120),
			url: takeUrl,
			durationSeconds: elapsed,
		};
		playbackPaused = true;
		setPhase("saved");
		onqueued({
			localId,
			blob,
			mimeType: format?.mimeType ?? "application/octet-stream",
			ext: format?.ext ?? "webm",
			name: loaded.title,
			durationSeconds: elapsed,
		});
	}

	/** The upload landed: the loaded take, if it is still this one, takes the server's id and number. */
	export function resolve(localId: string, saved: { id: string; takeNumber: number }) {
		if (loaded?.id === localId) loaded = { ...loaded, id: saved.id, takeNumber: saved.takeNumber };
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
		for (const el of [menuEl, takeMenuEl]) {
			if (el?.open && !(e.type === "pointerdown" && el.contains(e.target as Node))) el.open = false;
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
		meterBuf = new Float32Array(analyser.fftSize);
		let hold = 0;
		const loop = () => {
			if (!analyser) return;
			const max = sampleLevel();
			if (max >= hold) hold = max;
			else hold = Math.max(max, hold - 0.01);
			peak = hold;
			meterFrame = requestAnimationFrame(loop);
		};
		meterFrame = requestAnimationFrame(loop);
	}
	let meterBuf: Float32Array<ArrayBuffer> | null = null;
	/** Reads the input once: sets `level` (RMS × 3, capped at 1) and returns the sample peak. */
	function sampleLevel(): number {
		if (!analyser || !meterBuf) return 0;
		analyser.getFloatTimeDomainData(meterBuf);
		let sum = 0;
		let max = 0;
		for (const x of meterBuf) {
			sum += x * x;
			if (Math.abs(x) > max) max = Math.abs(x);
		}
		level = Math.min(1, Math.sqrt(sum / meterBuf.length) * 3);
		return max;
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
	class="rounded bg-transparent bg-gradient-to-br from-black/30 to-black/40 grid grid-cols-1 place-content-start gap-4 border border-current/20 sm-border-current/40 pt-5 pb-6 px-3 sm-px-5 sm-py-5 sm-rounded-md"
>
	<!-- the idea's title and, once there is a take, its number and name -->
	<div class="grid grid-cols-[1fr_auto] sm-grid-cols-1 gap-2 sm-gap-3">
		<!-- idea name -->
		<label class="block">
			<span class="sr-only">Idea Title</span>
			<input
				class="bg-white/5 rounded px-2 w-full max-w-120ch text-16px sm-text-17px sm-font-500 border border-transparent focus:(border-maximumYellow outline-none)"
				type="text"
				maxlength="120"
				autocomplete="off"
				data-1p-ignore
				data-lpignore="true"
				data-bwignore
				bind:value={ideaTitle}
				onchange={() => ontitlechange(ideaTitle.trim())}
				onkeydown={(e) => {
					if (e.key === "Enter") e.currentTarget.blur();
				}}
			/>
		</label>
		<!-- take number and name -->
		<label class="grid grid-cols-[auto_1fr] items-center gap-3 text-sm">
			<span
				class="whitespace-nowrap bg-white/4 h-full w-auto px-2 flex justify-center items-center rounded"
			>
				{#if phase === "recording"}
					New take
				{:else if loaded && isLocal(loaded.id)}
					Saving take…
				{:else if loaded && takes.length > 1}
					<!-- A quick jump to any other take of the idea. -->
					<details class="relative inline-block" bind:this={takeMenuEl}>
						<summary
							class="cursor-pointer opacity-90 list-none hover:text-accent [&::-webkit-details-marker]:hidden"
							aria-label="Take {loaded.takeNumber}: jump to another take"
						>
							Take {loaded.takeNumber} of {takes.length}
							<span class="i-ph-caret-down inline-block text-10px align-middle" aria-hidden="true"
							></span>
						</summary>
						<div
							class="absolute top-full left-0 z-20 mt-1 min-w-48 max-h-64 overflow-y-auto rounded border border-white/15 bg-oxford p-1 font-sans text-sm shadow-lg"
							role="menu"
						>
							{#each takes as t (t.id)}
								<button
									class="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-white/10"
									type="button"
									role="menuitemradio"
									aria-checked={t.id === loaded.id}
									onclick={() => {
										if (takeMenuEl) takeMenuEl.open = false;
										if (t.id !== loaded?.id) onpick?.(t);
									}}
								>
									<span
										class="i-ph-check {t.id === loaded.id ? '' : 'invisible'}"
										aria-hidden="true"
									></span>
									Take {t.takeNumber}{t.title ? ` · ${t.title}` : ""}
									<span class="ml-auto tabular-nums opacity-70"
										>{t.durationSeconds !== null ? formatTime(t.durationSeconds, 0) : ""}</span
									>
								</button>
							{/each}
						</div>
					</details>
				{:else if loaded}
					Take {loaded.takeNumber}
				{:else}
					Take 1
				{/if}
			</span>
			<input
				class="hidden sm-block field text-sm"
				type="text"
				maxlength="120"
				placeholder={loaded || phase === "recording" || phase === "requesting"
					? "Label this take (optional)"
					: "Label the next take (optional)"}
				autocomplete="off"
				data-1p-ignore
				data-lpignore="true"
				data-bwignore
				bind:value={takeName}
				disabled={loaded ? isLocal(loaded.id) : false}
				aria-label="Take label"
				onchange={() => {
					if (loaded && !isLocal(loaded.id))
						ontakename?.({ id: loaded.id, title: takeName.trim() });
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
	<div
		class="px-3 pb-1 sm-pb-2 leading-none grid sm-grid-cols-[auto_1fr] gap-4 sm-gap-8 relative rounded-md overflow-hidden"
	>
		<div class="rounded-md flex justify-between items-center sm-grid sm-grid-cols-1 gap-2">
			<span
				class="font-mono text-20px sm-text-34px md-text-38px lg-text-44px leading-none tabular-nums"
				aria-live="off">{formatTime(hasTake && !playbackPaused ? playhead : elapsed, 1)}</span
			>
			<div class="text-sm opacity-90">
				{#if phase === "recording"}
					<span class="mr-2 inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-red-500"
					></span>Recording
				{:else if hasTake && !playbackPaused}
					<span class="mr-2 inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-green-500"
					></span>Playing
				{:else if phase === "saved" && loaded && isLocal(loaded.id)}
					<span class="mr-3 inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-orange-500"
					></span>Saving in the background
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
				class="mt-1 sm-mt-3 w-full relative z-10 grid grid-cols-[auto_1fr] gap-2"
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
			<!-- iOS keeps playback volume on the hardware buttons: a slider there does nothing. -->
			<label
				class="{onIOS
					? 'hidden'
					: 'hidden sm-grid'} w-full grid-cols-[auto_1fr] items-center gap-2 text-sm opacity-90"
			>
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
				class="button button-sm border-current/10 flex items-center list-none !min-h-31px [&::-webkit-details-marker]:hidden"
				title="More"
				aria-label="Take menu"
			>
				<span class="i-ph-dots-three-outline-vertical-fill" aria-hidden="true"></span>
			</summary>
			<div
				class="absolute top-full right-0 z-20 mt-1 min-w-48 rounded border border-white/15 bg-oxford p-1 text-sm shadow-lg"
				role="menu"
			>
				{#if phase === "saved" && loaded && isLocal(loaded.id)}
					<div class="px-2 py-1 text-xs opacity-70">Saving… song actions follow in a moment</div>
					<button
						class="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-white/10"
						type="button"
						role="menuitem"
						onclick={download}
					>
						<span class="i-ph-download-simple" aria-hidden="true"></span>Download
					</button>
				{:else if phase === "saved" && loaded}
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
				{#if onnewidea && (phase === "saved" || phase === "idle")}
					{#if phase === "saved"}
						<hr class="my-1 border-white/15" />
					{/if}
					<button
						class="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-white/10 disabled:opacity-40"
						type="button"
						role="menuitem"
						disabled={newIdeaDisabled}
						onclick={() => {
							if (menuEl) menuEl.open = false;
							onnewidea?.();
						}}
					>
						<span class="i-ph-plus" aria-hidden="true"></span>New idea
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
				{:else if phase !== "saved" && !onnewidea}
					<div class="px-2 py-1 text-xs opacity-70">Nothing to do here yet</div>
				{/if}
			</div>
		</details>
	</div>
</div>
