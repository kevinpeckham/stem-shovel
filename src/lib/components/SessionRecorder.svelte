<script lang="ts">
	import { inputSources, type InputSource } from "#lib/audio/inputs.svelte.js";
	import { stereoFill } from "#lib/audio/stereoFill.js";
	import ComboBox from "#lib/components/ComboBox.svelte";
	import SessionDeviceSelect from "#lib/components/SessionDeviceSelect.svelte";
	import {
		SESSION_KIND_LABELS,
		SESSION_KINDS,
		type SessionKind,
	} from "#lib/constants/sessionRecordings.js";
	import { RECORDING_BITS_PER_SECOND } from "#lib/constants/takeLimits.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { postJson, uploadSessionFile, type SessionReservation } from "#lib/upload.js";
	import { audioSession } from "#lib/utils/audioSession.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";
	import { formatBytes } from "#lib/utils/formatBytes.js";
	import { formatTime } from "#lib/utils/formatTime.js";
	import { localDay } from "#lib/utils/isoDay.js";
	import {
		recordingMimeType,
		type RecordingFormat,
		type RecordingQuality,
	} from "#lib/utils/recordingMimeType.js";
	import { sessionRecordingTitle } from "#lib/utils/sessionRecordingTitle.js";
	import { slugify } from "#lib/utils/slugify.js";
	import type { SessionDevice } from "#lib/val/SessionRecordingSchema.js";
	import { onDestroy, onMount } from "svelte";

	/**
	 * The session recorder (docs/uploads-and-blob.md, "The session
	 * recorder"): the Idea Recorder stripped to one job, a stereo recording
	 * of the room from the microphone or the line in, saved as a session
	 * recording. Pick the input, press Record, press Stop, hear it back,
	 * name it, say which session (or let the day decide) and Save: the file
	 * uploads as the Sessions page's uploads do and the recording's row
	 * takes it from there (the MP3, the waveform). Compressed by default
	 * (Opus or AAC, an hour in a few dozen MB); lossless where the browser
	 * can, when asked. A low cut (a 12 dB/octave high-pass at 60, 80 or
	 * 120 Hz, on at 80 by default, remembered per browser) takes the rumble
	 * out of a room recording before it is written. One take at a time,
	 * nothing kept in the browser: a take is uploaded or discarded.
	 */
	interface Props {
		accountId: string;
		/** The account's sessions, newest first, for the picker; "auto" lets the day decide. */
		sessions: { id: string; label: string; description: string }[];
		/** The saved recording's id: the page goes to it on the Sessions page. */
		onsaved: (recordingId: string) => void;
	}
	let { accountId, sessions, onsaved }: Props = $props();

	type Phase = "idle" | "arming" | "recording" | "stopped" | "saving";
	let phase = $state<Phase>("idle");
	let source = $state<InputSource>("mic");
	let quality = $state<RecordingQuality>("compressed");
	/** The low cut: 0 for off, or the corner frequency in Hz (a second-order high-pass before the recorder); 80 unless the browser remembers otherwise. */
	const LOW_CUTS = [60, 80, 120] as const;
	const LOW_CUT_KEY = "stemshovel.session-recorder.low-cut";
	let lowCut = $state<number>(80);
	function setLowCut(hz: number) {
		lowCut = hz;
		try {
			localStorage.setItem(LOW_CUT_KEY, String(hz));
		} catch {
			// Private mode: the setting lasts for this page.
		}
	}
	let notice = $state<string | null>(null);
	let elapsed = $state(0);
	let format = $state<RecordingFormat | null>(null);
	let take = $state<{ blob: Blob; url: string; seconds: number; startedAt: Date } | null>(null);
	let progress = $state(0);
	const level = $derived(inputSources.levels[source]);
	const deviceLabel = $derived(inputSources.labels[source] ?? null);

	// What the saved recording says: filled when the take stops, edited before Save.
	let title = $state("");
	let intoSession = $state("auto");
	let kind = $state<SessionKind>("practice");
	let place = $state("");
	let inputSourceText = $state("");
	/** The kind of device recording (a phone, a field rig), saved with the take; "" for unset. */
	let inputDevice = $state<SessionDevice>("");
	const sessionOptions = $derived([
		{ value: "auto", label: "Today's session", description: "the session of today, or a new one" },
		...sessions.map((s) => ({ value: s.id, label: s.label, description: s.description })),
	]);

	let ctx: AudioContext | null = null;
	let recorder: MediaRecorder | null = null;
	let chunks: Blob[] = [];
	let tick: ReturnType<typeof setInterval> | null = null;
	let runStart = 0;
	let wakeLock: WakeLockSentinel | null = null;
	let unlisten: (() => void) | null = null;

	onMount(() => {
		void inputSources.listInputs();
		try {
			const saved = localStorage.getItem(LOW_CUT_KEY);
			if (saved !== null && [0, ...LOW_CUTS].includes(Number(saved) as 0 | 60 | 80 | 120))
				lowCut = Number(saved);
		} catch {
			// Nothing remembered.
		}
		// The input went away mid-take (a call, an interface unplugged): keep what there is.
		unlisten = inputSources.listen((src, node) => {
			if (src === source && node === null && phase === "recording") {
				notice = "The input stopped (a call, or the interface went away). The take so far is kept.";
				stop();
			}
		});
	});

	async function record() {
		if (phase !== "idle") return;
		notice = null;
		phase = "arming";
		// WebKit refuses to capture under the "playback" category the players set.
		const session = audioSession();
		if (session) session.type = "play-and-record";
		format = recordingMimeType((t) => MediaRecorder.isTypeSupported(t), quality);
		if (!format) {
			notice = "This browser cannot record audio. Try a current Chrome, Firefox or Safari.";
			phase = "idle";
			return;
		}
		ctx ??= new AudioContext();
		if (ctx.state === "suspended") await ctx.resume();
		// A silent monitor: the sources are wired into this context for the meter and the recorder, never the speakers.
		const silent = ctx.createGain();
		silent.gain.value = 0;
		silent.connect(ctx.destination);
		inputSources.attach(ctx, { monitorOut: silent, onsource: () => {} });
		const ok = await inputSources.requestInput(source);
		const node = ok ? inputSources.output(source) : null;
		if (!ok || !node) {
			notice = inputSources.errors[source] ?? "The input could not be opened.";
			phase = "idle";
			return;
		}
		const dest = ctx.createMediaStreamDestination();
		dest.channelCount = 2;
		// The low cut, when on: a Butterworth high-pass (Q 0.707, 12 dB/octave) between the input and the recorder.
		let tail: AudioNode = node;
		if (lowCut > 0) {
			const hp = ctx.createBiquadFilter();
			hp.type = "highpass";
			hp.frequency.value = lowCut;
			hp.Q.value = Math.SQRT1_2;
			node.connect(hp);
			tail = hp;
		}
		// The stereo fill: a phone's mono microphone on both channels of the file (static/worklets/stereo-fill.js); without it, straight in.
		let fill: AudioNode | null = null;
		try {
			fill = await stereoFill(ctx);
		} catch {
			fill = null;
		}
		if (fill) {
			tail.connect(fill);
			fill.connect(dest);
		} else tail.connect(dest);
		chunks = [];
		const rec = new MediaRecorder(dest.stream, {
			mimeType: format.mimeType,
			...(format.lossless ? {} : { audioBitsPerSecond: RECORDING_BITS_PER_SECOND }),
		});
		rec.ondataavailable = (e) => {
			if (e.data.size > 0) chunks.push(e.data);
		};
		rec.onstop = () => finish(dest, tail, fill);
		recorder = rec;
		rec.start(1000);
		runStart = performance.now();
		elapsed = 0;
		tick = setInterval(() => (elapsed = (performance.now() - runStart) / 1000), 200);
		phase = "recording";
		void keepAwake();
	}

	function stop() {
		if (!recorder || phase !== "recording") return;
		elapsed = (performance.now() - runStart) / 1000;
		if (tick) clearInterval(tick);
		tick = null;
		recorder.stop(); // finish() runs once the last chunk is in
	}

	function finish(dest: MediaStreamAudioDestinationNode, node: AudioNode, fill: AudioNode | null) {
		node.disconnect(fill ?? dest);
		fill?.disconnect();
		inputSources.stop(source);
		if (ctx) inputSources.detach(ctx);
		const session = audioSession();
		if (session && session.type === "play-and-record") session.type = "auto";
		void wakeLock?.release();
		wakeLock = null;
		const blob = new Blob(chunks, { type: format?.mimeType ?? "application/octet-stream" });
		chunks = [];
		recorder = null;
		if (blob.size === 0 || elapsed < 0.5) {
			notice = "Nothing was recorded.";
			phase = "idle";
			return;
		}
		const startedAt = new Date(Date.now() - elapsed * 1000);
		take = { blob, url: URL.createObjectURL(blob), seconds: elapsed, startedAt };
		title = sessionRecordingTitle(startedAt, kind);
		inputSourceText = deviceLabel ?? "";
		phase = "stopped";
	}

	function discard() {
		if (take) URL.revokeObjectURL(take.url);
		take = null;
		elapsed = 0;
		phase = "idle";
	}

	async function save() {
		if (!take || !format) return;
		phase = "saving";
		progress = 0;
		const name = `${slugify(title) || "recording"}.${format.ext}`;
		const file = new File([take.blob], name, {
			type: format.mimeType,
			lastModified: take.startedAt.getTime(),
		});
		let recordingId = "";
		try {
			await uploadSessionFile(
				file,
				async () => {
					const r = await postJson<SessionReservation>("/api/sessions", {
						accountId,
						sessionId: intoSession === "auto" ? undefined : intoSession,
						kind,
						recordedOn: localDay(take!.startedAt),
						place,
						source: inputSourceText,
						device: inputDevice,
						title,
						filename: file.name,
						sizeBytes: file.size,
					});
					recordingId = r.recordingId;
					return r;
				},
				(percent) => (progress = percent),
			);
		} catch (e) {
			notify(`Not saved: ${errorMessage(e)}`, { kind: "error" });
			phase = "stopped";
			return;
		}
		notify("Recording saved; its MP3 and waveform are on the way");
		URL.revokeObjectURL(take.url);
		take = null;
		phase = "idle";
		onsaved(recordingId);
	}

	/** Keeps a phone's screen on mid-take (iOS stops recording when it sleeps). */
	async function keepAwake() {
		try {
			wakeLock = (await navigator.wakeLock?.request("screen")) ?? null;
		} catch {
			wakeLock = null;
		}
	}

	onDestroy(() => {
		unlisten?.();
		if (tick) clearInterval(tick);
		if (recorder && recorder.state !== "inactive") {
			recorder.onstop = null;
			recorder.stop();
		}
		if (take) URL.revokeObjectURL(take.url);
		if (ctx) {
			inputSources.detach(ctx);
			void ctx.close();
		}
		void wakeLock?.release();
	});
</script>

<div
	class="grid gap-5 rounded-md border border-current/40 bg-blue-300/5 px-5 py-5"
	data-session-recorder
>
	<!-- the input -->
	<div class="flex flex-wrap items-end gap-3">
		<fieldset class="grid gap-1 text-13px text-dim" disabled={phase !== "idle"}>
			<legend class="mb-1">Input</legend>
			<span class="flex items-center">
				{#each ["mic", "line"] as const as src (src)}
					<button
						type="button"
						class="rounded border px-3 py-1 text-14px {source === src
							? 'border-blue-300 bg-blue-300 text-dark'
							: 'border-current/40 opacity-80 hover-opacity-100'} {src === 'mic'
							? 'rounded-r-none'
							: 'rounded-l-none border-l-0'}"
						aria-pressed={source === src}
						onclick={() => (source = src)}>{src === "mic" ? "Microphone" : "Line in"}</button
					>
				{/each}
			</span>
		</fieldset>
		{#if inputSources.inputs.length > 1}
			<label class="grid gap-1 text-13px text-dim">
				Device
				<select
					class="field"
					disabled={phase !== "idle"}
					value={inputSources.deviceIds[source] ?? ""}
					onchange={(e) => inputSources.setDevice(source, e.currentTarget.value || null)}
				>
					<option value="">Default</option>
					{#each inputSources.inputs as d (d.id)}
						<option value={d.id}>{d.label}</option>
					{/each}
				</select>
			</label>
		{/if}
		<label class="flex items-center gap-2 text-13px text-dim">
			<input
				type="checkbox"
				class="accent-maximumYellow"
				disabled={phase !== "idle"}
				checked={quality === "lossless"}
				onchange={(e) => (quality = e.currentTarget.checked ? "lossless" : "compressed")}
			/>
			Lossless <span class="opacity-70">(much larger files)</span>
		</label>
		<label class="grid gap-1 text-13px text-dim">
			Low cut
			<select
				class="field"
				aria-label="Low cut"
				title="A high-pass filter on the way in: takes the rumble and handling noise out of a room recording"
				disabled={phase !== "idle"}
				value={String(lowCut)}
				onchange={(e) => setLowCut(Number(e.currentTarget.value))}
			>
				<option value="0">Off</option>
				{#each LOW_CUTS as hz (hz)}
					<option value={String(hz)}>{hz} Hz</option>
				{/each}
			</select>
		</label>
	</div>

	<!-- the meter, the clock and the button -->
	<div class="grid gap-3">
		<div
			class="h-2 w-full overflow-hidden rounded bg-white/10"
			role="meter"
			aria-label="Input level"
			aria-valuemin="0"
			aria-valuemax="100"
			aria-valuenow={Math.round(level * 100)}
		>
			<div
				class="h-full rounded bg-accent transition-[width] duration-75"
				style:width="{Math.min(100, level * 100)}%"
			></div>
		</div>
		<div class="flex flex-wrap items-center gap-4">
			{#if phase === "recording"}
				<button
					type="button"
					class="grid h-20 w-20 place-items-center rounded-full bg-red-500 text-white shadow-lg shadow-red-900/40 active:scale-95"
					aria-label="Stop"
					onclick={stop}
				>
					<span class="i-ph-stop-fill text-32px" aria-hidden="true"></span>
				</button>
			{:else}
				<button
					type="button"
					class="grid h-20 w-20 place-items-center rounded-full border-4 border-red-500 text-red-500 active:scale-95 disabled:opacity-40"
					aria-label="Record"
					disabled={phase !== "idle"}
					onclick={() => void record()}
				>
					<span class="i-ph-record-fill text-32px" aria-hidden="true"></span>
				</button>
			{/if}
			<div class="min-w-0">
				<p class="font-mono text-28px tabular-nums leading-none" aria-live="off">
					{formatTime(elapsed)}
				</p>
				<p class="mt-1 text-13px text-dim" aria-live="polite">
					{#if phase === "recording"}
						Recording{#if deviceLabel}
							from {deviceLabel}{/if}{#if format}
							· {format.codec}{format.lossless ? " lossless" : ""}{/if}{#if lowCut}
							· low cut {lowCut} Hz{/if}
					{:else if phase === "arming"}
						Opening the input…
					{:else if phase === "stopped" && take}
						{formatTime(take.seconds)} recorded · {formatBytes(take.blob.size)}
					{:else if phase === "saving"}
						Saving… {Math.round(progress)}%
					{:else}
						Press Record. Stop when the song or the set is done.
					{/if}
				</p>
			</div>
		</div>
		{#if notice}
			<p class="text-13px text-amber-200" role="status">{notice}</p>
		{/if}
	</div>

	<!-- the take: hear it, name it, save it -->
	{#if take && (phase === "stopped" || phase === "saving")}
		<form
			class="grid gap-3 border-t border-white/10 pt-4"
			onsubmit={(e) => {
				e.preventDefault();
				void save();
			}}
		>
			<!-- svelte-ignore a11y_media_has_caption -->
			<audio class="w-full" controls src={take.url} preload="metadata"></audio>
			<div class="flex flex-wrap items-end gap-3">
				<label class="grid min-w-56 flex-1 gap-1 text-13px text-dim">
					Title
					<input class="field" type="text" maxlength="120" required bind:value={title} />
				</label>
				<label class="grid gap-1 text-13px text-dim">
					Session
					<ComboBox
						ariaLabel="Session"
						options={sessionOptions}
						value={intoSession}
						onchange={(v) => (intoSession = v)}
						buttonClasses="min-w-56"
					/>
				</label>
				{#if intoSession === "auto"}
					<fieldset class="grid gap-1 text-13px text-dim">
						<legend class="mb-1">Kind</legend>
						<span class="flex items-center">
							{#each SESSION_KINDS as k (k)}
								<button
									type="button"
									class="rounded border px-3 py-1 text-14px {kind === k
										? 'border-blue-300 bg-blue-300 text-dark'
										: 'border-current/40 opacity-80 hover-opacity-100'} {k === 'practice'
										? 'rounded-r-none'
										: 'rounded-l-none border-l-0'}"
									aria-pressed={kind === k}
									onclick={() => (kind = k)}>{SESSION_KIND_LABELS[k]}</button
								>
							{/each}
						</span>
					</fieldset>
					<label class="grid gap-1 text-13px text-dim">
						Place
						<input
							class="field"
							type="text"
							placeholder="The rehearsal room, the venue"
							maxlength="120"
							bind:value={place}
						/>
					</label>
				{/if}
				<SessionDeviceSelect bind:value={inputDevice} />
				<label class="grid gap-1 text-13px text-dim">
					Input name
					<input
						class="field"
						type="text"
						placeholder="Room mic"
						maxlength="120"
						bind:value={inputSourceText}
					/>
				</label>
			</div>
			<div class="flex gap-2">
				<button class="button-accent" type="submit" disabled={phase === "saving"}>
					<span class="i-ph-upload-simple" aria-hidden="true"></span>
					{phase === "saving" ? "Saving…" : "Save to sessions"}
				</button>
				<button class="button" type="button" disabled={phase === "saving"} onclick={discard}
					>Discard</button
				>
			</div>
		</form>
	{/if}
</div>
