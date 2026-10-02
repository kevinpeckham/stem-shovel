<script module lang="ts">
	import { OUTSIDE_SOURCE_LABELS, type OutsideSource } from "$lib/audio/inputs.svelte";

	/**
	 * What a take can record (docs/demo-recording.md, "Input sources"): the
	 * three outside sources of src/lib/audio/inputs.svelte.ts and the two
	 * instruments. Any mix of them is in a take at once; a source's button
	 * on the device switches it in or out.
	 */
	export type RecorderSource = OutsideSource | "piano" | "drums";
	export const RECORDER_SOURCES: RecorderSource[] = ["mic", "line", "computer", "piano", "drums"];
	export const RECORDER_SOURCE_LABELS: Record<RecorderSource, string> = {
		...OUTSIDE_SOURCE_LABELS,
		piano: "Piano",
		drums: "Drums",
	};
</script>

<script lang="ts">
	import RecorderWave from "$lib/components/RecorderWave.svelte";
	import IconDrumKit from "$lib/components/IconDrumKit.svelte";
	import { computePeaks } from "$lib/audio/peaks";
	import { RECORDING_BITS_PER_SECOND, SILENCE_LEVEL } from "$lib/constants/takeLimits";
	import { isIOS } from "$lib/utils/isIOS";
	import { audioSession } from "$lib/utils/audioSession";
	import { playbackMime } from "$lib/utils/playbackMime";
	import type { RecordingFormat, RecordingQuality } from "$lib/utils/recordingMimeType";
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
	import { encodeWav } from "$lib/utils/encodeWav";
	import { encodeWav24 } from "$lib/utils/encodeWav24";
	import { inputSources } from "$lib/audio/inputs.svelte";
	import { piano } from "$lib/audio/piano.svelte";
	import { drumMachine } from "$lib/audio/drumMachine.svelte";
	import InputSourceSettings from "$lib/components/InputSourceSettings.svelte";
	import SourceButton from "$lib/components/SourceButton.svelte";
	import { recordingMimeType } from "$lib/utils/recordingMimeType";
	import { onDestroy } from "svelte";
	import ComboBox from "$lib/components/ComboBox.svelte";
	import ContextMenu from "$lib/components/ContextMenu.svelte";

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
		/** The original as recorded (a blob: URL for a take just made). */
		url: string;
		/** The MP3 rendition once the jobs function has made it. */
		playbackUrl: string | null;
		/** alac, pcm, flac, opus, aac; null on takes from before it was recorded. */
		codec: string | null;
		durationSeconds: number | null;
		/** A multitrack take's sources (docs/demo-recording.md, "Multitrack takes"); absent or empty on a stereo take. */
		stems?: { id: string; label: string }[];
	}
	const SOURCE_ICONS: Record<OutsideSource | "piano", string> = {
		mic: "i-ph-microphone",
		line: "i-ph-plugs",
		computer: "i-ph-desktop",
		piano: "i-ph-piano-keys",
	};
	const isOutside = (s: RecorderSource): s is OutsideSource =>
		s === "mic" || s === "line" || s === "computer";

	interface Props {
		/** The idea's title, shown and edited in the panel (the page saves it). */
		ideaTitle: string;
		/**
		 * Which sources are in the take, the page's state (remembered per browser), with
		 * `ontoggle` for a button press; null is the plain recorder (the home page's demo):
		 * the microphone alone, asked for at Record. The instruments' capture streams come
		 * from `instrumentStreams` as a take starts (a gesture), so a beat started after
		 * Record still goes in.
		 */
		sourcesOn?: Record<RecorderSource, boolean> | null;
		ontoggle?: (source: RecorderSource, on: boolean) => void;
		instrumentStreams?: () => Partial<Record<"piano" | "drums", MediaStream>>;

		/** A stopped take, with its audio: the page queues the upload. */
		onqueued: (take: {
			localId: string;
			blob: Blob;
			mimeType: string;
			ext: string;
			codec: string;
			name: string;
			durationSeconds: number;
			/** A multitrack take's sources, in order (the microphone first); absent on a stereo take. */
			stems?: { label: string; blob: Blob; mimeType: string; ext: string; codec: string }[];
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
		/** A multitrack take's sources onto a song as stems. */
		onaddstems?: (take: Take) => void;
		/** Record the sources (microphone, each instrument) as files of their own beside the mix; the page offers it only with an instrument in the take, off by default each visit. */
		multitrack?: boolean;
		multitrackAvailable?: boolean;
		/** Delete the whole idea (from the ⋯ menu). */
		ondeleteidea?: () => void;
		/** Start a new idea (from the ⋯ menu); `newIdeaDisabled` when there is nothing to leave. */
		onnewidea?: () => void;
		newIdeaDisabled?: boolean;
		/** The idea's takes, so the "Take N" label can jump between them. */
		takes?: Take[];
		/** A take chosen from the label's dropdown. */
		onpick?: (id: string) => void;
		/** A new take is starting. */
		onstart?: () => void;
		/** Every phase change, so the page can freeze its list mid-take. */
		onphase?: (phase: Phase) => void;
		/** Drop a take shorter than this many seconds (a mis-tap) instead of saving it; 0 keeps every take. */
		minTakeSeconds?: number;
		/** Lossless where the browser can, or compressed (src/lib/utils/recorderPreferences.ts). */
		quality?: RecordingQuality;
	}
	let {
		ideaTitle = $bindable(),
		onqueued,
		ontitlechange,
		ontakename,
		ondeletetake,
		onaddtosong,
		onnewsong,
		onaddstems,
		multitrack = $bindable(false),
		multitrackAvailable = false,
		ondeleteidea,
		onnewidea,
		newIdeaDisabled = false,
		takes = [],
		onpick,
		onstart,
		onphase,
		minTakeSeconds = 0,
		quality = "lossless",
		sourcesOn = null,
		ontoggle,
		instrumentStreams = () => ({}),
	}: Props = $props();
	/** The sources mode (the Idea Recorder) against the plain microphone recorder (the home page's demo). */
	const withSources = $derived(sourcesOn !== null);
	const anySourceOn = $derived(!!sourcesOn && RECORDER_SOURCES.some((s) => sourcesOn[s]));
	/** What the take is really being recorded as, from the track and the recorder. */
	let formatLine = $state<string | null>(null);
	const onIOS = isIOS();

	type Phase = "idle" | "requesting" | "recording" | "saved";
	/** A just-stopped take is `local:<id>` until the upload lands and the page resolves it. */
	const isLocal = (id: string) => id.startsWith("local:");
	let phase = $state<Phase>("idle");
	let elapsed = $state(0);
	let level = $state(0);
	/**
	 * Each instrument's level for its source button, from an analyser on its
	 * capture stream in this page's context while it is in the take (so the
	 * meter runs before Record, as the outside sources' do in inputs.svelte.ts).
	 */
	let instLevels = $state<Record<"piano" | "drums", number>>({ piano: 0, drums: 0 });
	let instTaps: Partial<
		Record<
			"piano" | "drums",
			{ node: AudioNode; analyser: AnalyserNode; buf: Float32Array<ArrayBuffer> }
		>
	> = {};
	let instFrame = 0;
	/** The page's one AudioContext in sources mode, made on the first gesture and kept: the sources' nodes live in it (inputs.svelte.ts attaches here) and every take mixes in it. */
	function ensureContext(): AudioContext {
		if (!ctx) {
			ctx = new AudioContext();
			inputSources.attach(ctx, { monitorOut: ctx.destination, onsource: () => {} });
		} else if (inputSources.context !== ctx) {
			inputSources.attach(ctx, { monitorOut: ctx.destination, onsource: () => {} });
		}
		if (ctx.state !== "running") void ctx.resume().catch(() => {});
		return ctx;
	}
	/** An instrument's meter follows its button: tapped while in the take, dropped when out. */
	function tapInstrument(inst: "piano" | "drums", on: boolean) {
		const had = instTaps[inst];
		if (on && !had) {
			const stream = instrumentStreams()[inst];
			if (!stream) return;
			const c = ensureContext();
			const node = c.createMediaStreamSource(stream);
			const analyser = c.createAnalyser();
			analyser.fftSize = 1024;
			node.connect(analyser);
			instTaps[inst] = { node, analyser, buf: new Float32Array(analyser.fftSize) };
			if (!instFrame) instMeter();
		} else if (!on && had) {
			had.node.disconnect();
			had.analyser.disconnect();
			delete instTaps[inst];
			instLevels[inst] = 0;
		}
	}
	function instMeter() {
		const keys = Object.keys(instTaps) as ("piano" | "drums")[];
		if (keys.length === 0) {
			instFrame = 0;
			return;
		}
		for (const k of keys) {
			const t = instTaps[k]!;
			t.analyser.getFloatTimeDomainData(t.buf);
			let s2 = 0;
			for (const x of t.buf) s2 += x * x;
			instLevels[k] = Math.min(1, Math.sqrt(s2 / t.buf.length) * 3);
		}
		instFrame = requestAnimationFrame(instMeter);
	}
	// The instruments' meters follow the page's switches (a button here, or a panel header's), not only this component's own clicks.
	// fallow-ignore-next-line policy-violation:stem-shovel-house-rules/svelte-effect-last-resort -- the tap must follow state set by the page as well as by this component
	$effect(() => {
		if (!sourcesOn) return;
		tapInstrument("piano", sourcesOn.piano);
		tapInstrument("drums", sourcesOn.drums);
	});
	/**
	 * The inputs switched in but not yet open (the microphone is in by default,
	 * and a browser opens one only from a gesture): the first pointer-down on
	 * the device opens them, so their meters run before Record, as the looper
	 * does on its page. The computer needs its share picker: it waits for its button.
	 */
	let openingPending = false;
	async function openPending() {
		if (!sourcesOn || openingPending || !supported) return;
		const pending = (["mic", "line"] as const).filter((x) => sourcesOn[x] && !inputSources.has(x));
		if (pending.length === 0) return;
		openingPending = true;
		try {
			ensureContext();
			for (const src of pending) await inputSources.requestInput(src);
		} finally {
			openingPending = false;
		}
	}
	/** A source button: in or out of the take; an outside source opens as it goes in (a gesture) and closes as it goes out. */
	async function toggleSource(source: RecorderSource) {
		if (!sourcesOn || phase === "recording" || phase === "requesting") return;
		const on = !sourcesOn[source];
		if (isOutside(source)) {
			ensureContext();
			if (on) {
				const ok =
					source === "computer"
						? await inputSources.requestComputer()
						: await inputSources.requestInput(source);
				if (!ok) {
					notice = inputSources.errors[source] ?? null;
					return;
				}
			} else inputSources.stop(source);
		}
		ontoggle?.(source, on);
	}
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
	/** The audio element's length; a fresh WebM take reports Infinity, so the timed length stands in. */
	let takeDuration = $state(0);
	let takeLength = $derived(
		Number.isFinite(takeDuration) && takeDuration > 0
			? takeDuration
			: (loaded?.durationSeconds ?? elapsed),
	);
	let volume = $state(1);
	let contextMenuOpen: "open" | "closed" = $state("closed");
	let loopMode: "looping" | "not-looping" = $state("not-looping");

	let stream: MediaStream | null = null;
	let recorder: MediaRecorder | null = null;
	let chunks: Blob[] = [];
	let format = $state<RecordingFormat | null>(null);
	/** The sources of a multitrack take, set as the meter starts; each gets a MediaRecorder of its own started with the mix's. */
	let sources: { label: string; source: RecorderSource | null; stream: MediaStream }[] = [];
	let sourceRecorders: {
		label: string;
		source: RecorderSource | null;
		recorder: MediaRecorder;
		chunks: Blob[];
		done: Promise<void>;
	}[] = [];
	/** The take's own nodes in the kept context (sources mode), dropped at its end. */
	let takeNodes: AudioNode[] = [];
	/** Whether every source in the take is an outside one (then normalize may touch the mix too). */
	let allOutside = false;
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

	interface ComboBoxOption {
		value: string;
		label: string;
		/** Muted text after the label, "2 takes" or a hint. */
		description?: string;
	}

	let takeOptions: ComboBoxOption[] = $derived(
		takes.map((t) => ({
			value: t.id,
			label: `Take ${t.takeNumber}${t.title ? ` · ${t.title}` : ""}`,
			description: t.durationSeconds !== null ? formatTime(t.durationSeconds, 0) : undefined,
		})),
	);

	function setPhase(next: Phase) {
		phase = next;
		onphase?.(next);
	}

	async function start() {
		if (busy) return;
		notice = null;
		format = recordingMimeType((t) => MediaRecorder.isTypeSupported(t), quality);
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
		// The stem player may have set the page's audio session to "playback" (so it
		// plays through the iOS silent switch); WebKit refuses to capture under it.
		const session = audioSession();
		if (session) session.type = "play-and-record";
		if (sourcesOn) {
			const on = RECORDER_SOURCES.filter((x) => sourcesOn[x]);
			if (on.length === 0) {
				setPhase("idle");
				notice =
					"Switch on a source first: the microphone, the line in, the computer, the piano or the drums.";
				return;
			}
			// An outside source switched on but not open (permission pending, a share ended) opens now.
			for (const src of on) {
				if (!isOutside(src) || inputSources.has(src)) continue;
				const ok =
					src === "computer"
						? await inputSources.requestComputer()
						: await inputSources.requestInput(src);
				if (!ok) {
					setPhase("idle");
					notice = inputSources.errors[src] ?? `${RECORDER_SOURCE_LABELS[src]} is not available.`;
					return;
				}
			}
			const recorded = startMix(on);
			formatLine = [format.codec + (format.lossless ? " lossless" : ""), "stereo"].join(" · ");
			inputLabel = on
				.map(
					(src) =>
						(isOutside(src) ? inputSources.labels[src] : null) ?? RECORDER_SOURCE_LABELS[src],
				)
				.join(", ");
			beginTake(recorded);
			return;
		}
		try {
			// The three voice processors are on by default and ruin an instrument.
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
		// The format line: codec from the recorder, rate and channels from the track (Safari may omit them).
		const settings = track?.getSettings() ?? {};
		formatLine = [
			format.codec + (format.lossless ? " lossless" : ""),
			settings.sampleRate ? `${Math.round(settings.sampleRate / 1000)} kHz` : null,
			settings.channelCount ? (settings.channelCount >= 2 ? "stereo" : "mono") : null,
		]
			.filter(Boolean)
			.join(" · ");
		// A phone call or an unplugged interface ends the track: keep what we have.
		if (track) track.onended = () => onTrackEnded();
		const recorded = startMeter(stream);
		beginTake(recorded);
	}
	/** The recorders on the mix and, for a multitrack take, on each source, started in one tick so the files line up. */
	function beginTake(recorded: MediaStream) {
		if (!format) return;
		chunks = [];
		recorder = new MediaRecorder(recorded, {
			mimeType: format.mimeType,
			// A bitrate only means something for a lossy codec.
			...(format.lossless ? {} : { audioBitsPerSecond: RECORDING_BITS_PER_SECOND }),
		});
		recorder.ondataavailable = (e) => {
			if (e.data.size > 0) chunks.push(e.data);
		};
		recorder.onstop = () => void finishTake();
		waveHistory = [];
		// The sources' recorders start in the same tick as the mix's, so the files line up within a few milliseconds.
		sourceRecorders = sources.map((src) => {
			const r = new MediaRecorder(src.stream, {
				mimeType: format!.mimeType,
				...(format!.lossless ? {} : { audioBitsPerSecond: RECORDING_BITS_PER_SECOND }),
			});
			const parts: Blob[] = [];
			r.ondataavailable = (e) => {
				if (e.data.size > 0) parts.push(e.data);
			};
			const done = new Promise<void>((resolve) => {
				r.onstop = () => resolve();
				r.onerror = () => resolve();
			});
			r.start(1000);
			return { label: src.label, source: src.source, recorder: r, chunks: parts, done };
		});
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
		for (const x of sourceRecorders) if (x.recorder.state !== "inactive") x.recorder.stop();
		recorder.stop(); // finishTake() runs from onstop once the last chunk is in
	}

	function onTrackEnded() {
		if (phase === "recording") {
			notice = "The microphone stopped (a call, or the input went away). The take so far is saved.";
			stop();
		}
	}

	/**
	 * A file from an outside source, processed once decoded (inputs.svelte.ts):
	 * `trimMs` cut off its front (the input's measured latency, so a stem lines
	 * up with the instruments' in a multitrack take) and, with normalize on,
	 * scaled so its peak sits at −1 dBFS (never a near-silent or already-hot
	 * one), written as 24-bit WAV. Null when nothing applies or the browser
	 * cannot decode it: the file goes as recorded.
	 */
	async function processed(
		blob: Blob,
		opts: { trimMs: number; normalize: boolean },
	): Promise<{ blob: Blob; mimeType: string; ext: string; codec: string } | null> {
		if (opts.trimMs <= 0 && !opts.normalize) return null;
		try {
			const bytes = await blob.arrayBuffer();
			const decoder = new AudioContext();
			const audio = await decoder.decodeAudioData(bytes).finally(() => void decoder.close());
			const skip = Math.min(audio.length, Math.round((opts.trimMs / 1000) * audio.sampleRate));
			const channels = Array.from({ length: audio.numberOfChannels }, (_, i) =>
				audio.getChannelData(i).slice(skip),
			);
			let scaled = false;
			if (opts.normalize) {
				let peak = 0;
				for (const ch of channels) for (const x of ch) if (Math.abs(x) > peak) peak = Math.abs(x);
				const target = 0.891; // −1 dBFS
				if (peak >= 0.01 && peak < target) {
					const k = target / peak;
					for (const ch of channels) for (let i = 0; i < ch.length; i++) ch[i] *= k;
					scaled = true;
				}
			}
			if (skip === 0 && !scaled) return null;
			return {
				blob: new Blob([encodeWav24(channels, audio.sampleRate)], { type: "audio/wav" }),
				mimeType: "audio/wav",
				ext: "wav",
				codec: "pcm",
			};
		} catch {
			return null;
		}
	}

	async function finishTake() {
		// The sources' last chunks land on their own stop events; gather them before the streams close.
		await Promise.all(sourceRecorders.map((x) => x.done));
		const normalize = withSources && inputSources.normalize;
		// What each outside source's stem is late by: the measured input round trip, or the computer capture's slider.
		const trimOf = (src: RecorderSource | null) =>
			src === "mic" || src === "line"
				? inputSources.latencyMs
				: src === "computer"
					? inputSources.computerLatencyMs
					: 0;
		const stems = (
			await Promise.all(
				sourceRecorders.map(async (x) => {
					const raw = {
						label: x.label,
						blob: new Blob(x.chunks, { type: format?.mimeType ?? "application/octet-stream" }),
						mimeType: format?.mimeType ?? "application/octet-stream",
						ext: format?.ext ?? "webm",
						codec: (format?.codec ?? "opus").toLowerCase(),
					};
					if (!withSources || !x.source || !isOutside(x.source) || raw.blob.size === 0) return raw;
					const n = await processed(raw.blob, { trimMs: trimOf(x.source), normalize });
					return n ? { ...raw, ...n } : raw;
				}),
			)
		).filter((x) => x.blob.size > 0);
		sourceRecorders = [];
		sources = [];
		stopStream();
		let blob = new Blob(chunks, { type: format?.mimeType ?? "application/octet-stream" });
		let mixFormat = {
			mimeType: format?.mimeType ?? "application/octet-stream",
			ext: format?.ext ?? "webm",
			codec: (format?.codec ?? "opus").toLowerCase(),
		};
		// The mix is normalized only when nothing but outside sources is in it (an instrument's level is its own).
		if (normalize && allOutside && blob.size > 0) {
			const n = await processed(blob, { trimMs: 0, normalize: true });
			if (n) {
				blob = n.blob;
				mixFormat = { mimeType: n.mimeType, ext: n.ext, codec: n.codec };
			}
		}
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
			playbackUrl: null,
			codec: mixFormat.codec,
			durationSeconds: elapsed,
		};
		playbackPaused = true;
		setPhase("saved");
		onqueued({
			localId,
			blob,
			mimeType: mixFormat.mimeType,
			ext: mixFormat.ext,
			codec: mixFormat.codec,
			name: loaded.title,
			durationSeconds: elapsed,
			...(stems.length ? { stems } : {}),
		});
	}

	/** The upload landed: the loaded take, if it is still this one, takes the server's id and number. */
	export function resolve(localId: string, saved: { id: string; takeNumber: number }) {
		if (loaded?.id === localId) loaded = { ...loaded, id: saved.id, takeNumber: saved.takeNumber };
	}

	/**
	 * The loaded take's row was refreshed (its MP3 rendition landed, or Chrome's
	 * raw PCM became FLAC). A take just made keeps playing the browser's own
	 * blob unless that failed; a take from the list follows `sourceFor`.
	 */
	export function refreshUrl(t: Take) {
		if (!loaded || loaded.id !== t.id) return;
		const next = takeUrl?.startsWith("blob:") && !playError ? takeUrl : sourceFor(t);
		loaded = { ...loaded, url: t.url, playbackUrl: t.playbackUrl, codec: t.codec };
		if (takeUrl === next) return;
		const wasPlaying = !playbackPaused;
		const at = playhead;
		discardTake();
		takeUrl = next;
		playError = null;
		playhead = at;
		if (wasPlaying) playbackPaused = false;
	}
	let playError = $state<string | null>(null);

	// ---- the waveform (docs/demo-recording.md, "Waveform") ----
	/** The input's level per animation frame while recording, for the scrolling strip. */
	let waveHistory = $state<number[]>([]);
	/** The loaded take's peaks, decoded once per take (`computePeaks`); null until then, or when the file cannot be decoded here. */
	let wavePeaks = $state<Float32Array | null>(null);
	let waveFor: string | null = null;
	/** Decode the take for its waveform: the browser's own blob for a take just made, else the file at its URL (the rendition, which every browser decodes, when there is one). */
	$effect(() => {
		const url = takeUrl;
		if (!url || !hasTake) {
			wavePeaks = null;
			waveFor = null;
			return;
		}
		if (waveFor === url) return;
		waveFor = url;
		wavePeaks = null;
		const source =
			url.startsWith("blob:") && take
				? take.arrayBuffer()
				: fetch(url).then((r) => r.arrayBuffer());
		void source
			.then((bytes) => new OfflineAudioContext(1, 1, 44100).decodeAudioData(bytes))
			.then((buffer) => {
				if (waveFor === url) wavePeaks = computePeaks(buffer, 2048);
			})
			.catch(() => {
				// A file this browser cannot decode (or fetch): the screen keeps its centre line and the slider still seeks.
			});
	});

	/** Show a take from the list: its file plays on demand; Record starts the next take. */
	/**
	 * What to play for a saved take: the original whenever this browser can
	 * decode it (the same device that recorded it always can, a Mac plays an
	 * iPhone's ALAC, everything plays FLAC), else the MP3 rendition, else the
	 * original anyway (the rendition is not made yet; a media error then
	 * shows a notice until it is).
	 */
	function sourceFor(t: Take): string {
		const mime = playbackMime(t.codec);
		const canPlay = mime ? document.createElement("audio").canPlayType(mime) !== "" : false;
		return canPlay ? t.url : (t.playbackUrl ?? t.url);
	}

	export function load(t: Take) {
		if (busy) return;
		playbackPaused = true;
		discardTake();
		takeUrl = sourceFor(t);
		loaded = t;
		takeName = t.title;
		elapsed = 0; // the clock reads 0:00 for a take from the list (the list shows its length)
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
		playhead = 0; // the transport starts at zero for whatever is loaded next
	}

	function togglePlayback() {
		if (!hasTake) return;
		playbackPaused = !playbackPaused;
	}

	/** "<idea> - take 3.m4a", the take's extension (a loaded file's from its URL). */
	/** "<idea> - take 3 - <name>.<ext>", the extension from the file being saved. */
	function downloadName(url: string, extOverride?: string) {
		const fromUrl = url.startsWith("blob:") ? null : url.match(/\.([a-z0-9]+)(?:$|\?)/i)?.[1];
		const ext = extOverride ?? (take ? (format?.ext ?? "webm") : (fromUrl ?? "m4a"));
		const base = `${ideaTitle.trim() || "idea"} - take ${loaded?.takeNumber ?? 1}${takeName.trim() ? ` - ${takeName.trim()}` : ""}`;
		return `${base
			.replace(/[^\w.]+/g, "-")
			.replace(/^-|-$/g, "")
			.toLowerCase()}.${ext}`;
	}
	/** What the source download is called in the menu: its codec when known. */
	const sourceLabel = $derived.by(() => {
		const codec = loaded?.codec ?? format?.codec.toLowerCase() ?? null;
		const names: Record<string, string> = {
			alac: "ALAC lossless",
			flac: "FLAC lossless",
			pcm: "WAV lossless",
			opus: "Opus",
			aac: "AAC",
		};
		return codec && names[codec]
			? `Download Source <span class="inline-block ml-1 text-0.8em opacity-80">${names[codec]}</span>`
			: "Download Source";
	});
	/**
	 * "source" is the take as recorded (a take just made is its own blob; a
	 * saved one the server's file, FLAC once the jobs function has been at a
	 * Chrome take); "mp3" the playback rendition. Raw PCM in WebM, Chrome's
	 * lossless recording, opens almost nowhere, so it is handed over as a
	 * WAV: decoded here, same samples, a file any player or DAW reads.
	 */
	async function download(kind: "source" | "mp3") {
		const serverUrl =
			loaded && !isLocal(loaded.id) && !loaded.url.startsWith("blob:") ? loaded.url : null;
		const url = kind === "mp3" ? loaded?.playbackUrl : (serverUrl ?? takeUrl ?? loaded?.url);
		if (!url) return;
		const codec = loaded?.codec ?? format?.codec.toLowerCase() ?? null;
		try {
			if (kind === "source" && codec === "pcm") {
				// The take just made is its own Blob (the CSP allows no fetch of a blob: URL); a saved one is fetched.
				const bytes =
					take && url === takeUrl
						? await take.arrayBuffer()
						: await (await fetch(url)).arrayBuffer();
				const decoder = new AudioContext();
				const audio = await decoder.decodeAudioData(bytes).finally(() => void decoder.close());
				const channels = Array.from({ length: audio.numberOfChannels }, (_, i) =>
					audio.getChannelData(i),
				);
				const wav = URL.createObjectURL(encodeWav(channels, audio.sampleRate));
				const a = document.createElement("a");
				a.href = wav;
				a.download = downloadName(url, "wav");
				a.click();
				setTimeout(() => URL.revokeObjectURL(wav), 60_000);
			} else if (url.startsWith("blob:")) {
				const a = document.createElement("a");
				a.href = url;
				a.download = downloadName(url);
				a.click();
			} else await saveAs(url, downloadName(url));
		} catch (e) {
			notify(`Download failed: ${errorMessage(e)}`, { kind: "error" });
		}
	}

	/**
	 * The meter, and the stream the recorder takes: the microphone alone, or,
	 * with instruments playing into the take (the piano, the drums), all of
	 * them mixed in this context into a MediaStreamDestination; the
	 * microphone's tracks are disabled while it is muted (silence in the
	 * take and on its meter). The main analyser reads the mix (the peak and
	 * the waveform strip); the microphone's meter reads the microphone alone
	 * once instruments have meters of their own.
	 */
	function startMeter(s: MediaStream): MediaStream {
		ctx = new AudioContext();
		const source = ctx.createMediaStreamSource(s);
		analyser = ctx.createAnalyser();
		analyser.fftSize = 1024;
		let recorded = s;
		const streams = Object.entries(instrumentStreams()).map(([key, stream]) => ({
			label: key === "piano" ? "Piano" : "Drums",
			icon: key as "piano" | "drums",
			stream: stream!,
		}));
		// Multitrack: every source on its own recorder beside the mix (docs/demo-recording.md, "Multitrack takes").
		sources =
			multitrack && streams.length
				? [
						{ label: "Microphone", source: "mic" as const, stream: s },
						...streams.map(({ label, stream }) => ({ label, source: null, stream })),
					]
				: [];
		if (streams.length) {
			const mix = ctx.createMediaStreamDestination();
			for (const { stream } of streams) {
				const inst = ctx.createMediaStreamSource(stream);
				inst.connect(mix);
				inst.connect(analyser);
			}
			source.connect(mix);
			recorded = mix.stream;
		}
		source.connect(analyser); // not to the destination: no monitoring through the speaker
		beginMeterLoop();
		return recorded;
	}
	/**
	 * Sources mode: the chosen sources mixed in the kept context into a
	 * MediaStreamDestination for the recorder (and the waveform's analyser);
	 * for a multitrack take, each outside source also feeds a destination of
	 * its own after its gain, and each instrument records its capture stream.
	 */
	function startMix(on: RecorderSource[]): MediaStream {
		const c = ensureContext();
		analyser = c.createAnalyser();
		analyser.fftSize = 1024;
		const mix = c.createMediaStreamDestination();
		takeNodes = [analyser, mix];
		sources = [];
		const streams = instrumentStreams();
		allOutside = on.every(isOutside);
		for (const src of on) {
			let node: AudioNode | null = null;
			if (isOutside(src)) node = inputSources.output(src);
			else if (streams[src]) {
				node = c.createMediaStreamSource(streams[src]);
				takeNodes.push(node);
			}
			if (!node) continue;
			node.connect(mix);
			node.connect(analyser);
			if (multitrack && on.length >= 2) {
				let stream: MediaStream;
				if (isOutside(src)) {
					const dest = c.createMediaStreamDestination();
					node.connect(dest);
					takeNodes.push(dest);
					stream = dest.stream;
				} else stream = streams[src]!;
				sources.push({ label: RECORDER_SOURCE_LABELS[src], source: src, stream });
			}
		}
		beginMeterLoop();
		return mix.stream;
	}
	function beginMeterLoop() {
		if (!analyser) return;
		meterBuf = new Float32Array(analyser.fftSize);
		let hold = 0;
		const loop = () => {
			if (!analyser) return;
			const max = sampleLevel();
			if (max >= hold) hold = max;
			else hold = Math.max(max, hold - 0.01);
			peak = hold;
			// The waveform strip: the frame's peak while recording (kept to the last 1200 frames, about 20 s at 60 fps; the strip shows what fits).
			if (phase === "recording") {
				waveHistory.push(max);
				if (waveHistory.length > 1200) waveHistory.splice(0, waveHistory.length - 1200);
			}
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
		analyser?.disconnect();
		analyser = null;
		for (const n of takeNodes) n.disconnect();
		takeNodes = [];
		if (!withSources) {
			// The plain recorder's context lives for the take alone.
			void ctx?.close();
			ctx = null;
		}
		for (const t of stream?.getTracks() ?? []) t.stop();
		stream = null;
		recorder = null;
		// Capture is over: back to the default category, so playback routes and behaves as before.
		const session = audioSession();
		if (session && session.type === "play-and-record") session.type = "auto";
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
		if (instFrame) cancelAnimationFrame(instFrame);
		if (ctx) {
			inputSources.detach(ctx);
			void ctx.close();
			ctx = null;
		}
	});
</script>

<svelte:window
	onbeforeunload={(e) => {
		if (busy) e.preventDefault();
	}}
/>

{#if takeUrl && hasTake}
	<!-- svelte-ignore a11y_media_has_caption -->
	<audio
		src={takeUrl}
		bind:paused={playbackPaused}
		bind:currentTime={playhead}
		bind:duration={takeDuration}
		bind:volume
		loop={loopMode === "looping"}
		preload="auto"
		onended={() => (playbackPaused = true)}
		onerror={(e) => {
			const code = (e.currentTarget as HTMLAudioElement).error?.code;
			playbackPaused = true;
			// The original would not play: the rendition, when there is one; a notice until then.
			if (loaded?.playbackUrl && takeUrl !== loaded.playbackUrl) {
				takeUrl = loaded.playbackUrl;
				return;
			}
			playError = `This browser cannot play the take's own recording here${code ? ` (media error ${code})` : ""}; the MP3 made for playback takes over as soon as it is ready.`;
		}}
	></audio>
{/if}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	onpointerdown={() => void openPending()}
	class="
		@container
		rounded
		device-chrome
		grid
		grid-cols-1
		place-content-start
		gap-2
		pt-2
		pb-3
		px-3
		@xl-border-current/40
		@xl-gap-4
		@xl-pt-5
		@xl-px-5
		@xl-py-5"
>
	<!-- the idea's title and, once there is a take, its number and name -->
	<div class="grid grid-cols-[1fr_auto] @xl-grid-cols-1 gap-2 @xl-gap-3 max-w-60ch">
		<!-- idea name -->
		<label class="block device-window-bevel-md">
			<span class="sr-only">Idea Title</span>
			<input
				class="device-field w-full"
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
		<div class="grid grid-cols-1 @xl-grid-cols-[auto_1fr] items-center @xl-gap-2">
			<!-- Take Number -->
			<div class="device-window-bevel-md">
				<span
					class="device-field flex justify-start items-center h-full min-w-100px min-h-28.5px !max-w-100px truncate"
				>
					{#if phase === "recording"}
						<span class="truncate">New Take</span>
					{:else if loaded && isLocal(loaded.id)}
						<span class="truncate">Saving...</span>
					{:else if loaded && takes.length > 1}
						<ComboBox
							ariaLabel="Select Take"
							options={takeOptions}
							onchange={(id) => onpick?.(id)}
							buttonClasses="!bg-transparent !p-0 !h-full"
							popoverClasses="min-w-180px"
							value={loaded.id}
						/>
					{:else if loaded}
						<span class="truncate">Take {loaded.takeNumber}</span>
					{:else}
						<span class="truncate">Take 1</span>
					{/if}
				</span>
			</div>

			<!-- Take Name -->
			<div class="hidden @xl-block device-window-bevel-md">
				<input
					class="device-field min-w-full"
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
			</div>
		</div>
	</div>

	<!-- screen -->
	<div class="device-window-bevel-md mb-1 @xl-mb-0">
		<div class="device-screen leading-none grid gap-4 relative rounded-md overflow-hidden">
			<!-- the clock and status indicator -->
			<div class="rounded-md flex justify-between items-center gap-2 h-20px @xl-h-auto">
				<!-- clock -->
				<div
					class="font-mono text-20px @xl-text-34px @2xl-text-38px @4xl-text-44px leading-none tabular-nums"
					aria-live="off"
				>
					{formatTime(hasTake ? playhead : elapsed, 1)}{#if hasTake}<span
							class="text-[0.5em] opacity-60"
							aria-label="Length">&#8239;/&#8239;{formatTime(takeLength, 0)}</span
						>{/if}
				</div>

				<!-- status indicator -->
				<div class="flex items-center gap-2 justify-end text-0.9em">
					<!-- looping indicator (mobile-only) -->
					<span
						class="@xl-hidden i-ph-arrows-clockwise-fill {loopMode === 'looping'
							? 'bg-yellow-500'
							: 'bg-blue-100/10'}"
					></span>

					<!-- status text -->
					<span class="font-mono"
						>{phase === "recording"
							? "Recording"
							: hasTake && !playbackPaused
								? "Playing"
								: phase === "requesting"
									? "Loading"
									: "Ready"}</span
					>

					<!-- status light -->
					<span
						class="
					aspect-square
					mr-2
					inline-block
					h-2.5
					w-2.5
					rounded-full
					{phase === 'recording'
							? 'bg-red-500 animate-pulse'
							: phase === 'requesting'
								? 'bg-orange-500 animate-pulse'
								: hasTake && !playbackPaused
									? 'bg-green-500 animate-pulse'
									: 'bg-green-500'}
					"
					></span>
				</div>
			</div>

			<!-- the waveform: the take growing while recording, the whole take with a playhead once there is one -->
			<RecorderWave
				peaks={hasTake ? wavePeaks : null}
				history={waveHistory}
				recording={phase === "recording"}
				progress={hasTake && takeLength > 0 ? Math.min(1, playhead / takeLength) : 0}
				onseek={(f) => {
					if (hasTake) playhead = f * takeLength;
				}}
			/>

			<!-- input meter, playback controls, recording metadata  -->
			<div class="rounded grid grid-cols-1 gap-3 place-content-start max-w-300px @xl-min-h-80px">
				<!-- stereo mix or multitrack (a file per source beside the mix), offered with an instrument in the take; locked while recording -->
				{#if multitrackAvailable}
					<div
						class="mt-1 @xl-mt-3 flex items-center gap-2 text-12px"
						role="group"
						aria-label="Take format"
					>
						<button
							class="device-button-sm {multitrack ? '' : 'text-accent'}"
							type="button"
							aria-pressed={!multitrack}
							disabled={phase === "recording"}
							title="One stereo file with everything mixed together"
							onclick={() => (multitrack = false)}>Stereo</button
						>
						<button
							class="device-button-sm {multitrack ? 'text-accent' : ''}"
							type="button"
							aria-pressed={multitrack}
							disabled={phase === "recording"}
							title="The mix plus a file of its own for the microphone and each instrument, so the take can go to a song as stems"
							onclick={() => (multitrack = true)}>Multitrack</button
						>
					</div>
				{/if}
				<!-- the mix's meter (every source in the take; each source has its own on its button below), or the plain recorder's microphone -->
				<div
					class="{!multitrackAvailable
						? 'mt-1 @xl-mt-3'
						: ''} w-full relative z-10 grid grid-cols-[auto_1fr] gap-2"
					role="meter"
					aria-label={withSources ? "Mix level" : "Input level"}
					aria-valuemin="0"
					aria-valuemax="100"
					aria-valuenow={Math.round(level * 100)}
				>
					<span
						class="{withSources ? 'i-ph-waveform' : 'i-ph-microphone'} flex"
						aria-hidden="true"
						title={withSources ? "The mix of every source in the take" : "The microphone"}
					></span>
					<div class="relative h-3 overflow-hidden rounded bg-blue-300/10">
						<div
							class="h-full rounded {level > 0.85 ? 'bg-red-500' : 'bg-accent'}"
							style:width="{level * 100}%"
						></div>
						<div
							class="absolute top-0 h-full w-0.5 {peak > 0.98 ? 'bg-red-500' : 'bg-white/70'}"
							style:left="{Math.min(99.5, peak * 100)}%"
						></div>
					</div>
				</div>

				<!-- recording metadata: input source and data format -->
				{#if inputLabel && phase === "recording"}
					<!-- Two short lines, wrapped rather than cut: the input's name, then what is being recorded. -->
					<p class="w-full text-13px leading-normal opacity-90 text-balance">
						<span class="break-words">Input: {inputLabel}</span>
						{#if formatLine}
							<span class="block whitespace-nowrap">{formatLine}</span>
						{/if}
					</p>
				{/if}

				{#if notice || playError}
					<div class="w-full text-13px leading-normal opacity-90 text-balance" role="status">
						{#if notice}<div>{notice}</div>{/if}
						{#if playError}<div>{playError}</div>{/if}
					</div>
				{/if}
			</div>

			<div class="hidden @xl-flex items-center gap-3 justify-end bottom-2.5 right-3 font-mono">
				<!-- loop status -->
				<div
					class="i-ph-arrows-clockwise-fill {loopMode === 'looping'
						? 'bg-yellow-500'
						: 'bg-blue-100/10'}"
				></div>

				<!-- volume -->
				<div
					class="max-w-fit hidden @xl-block text-blue-100/80 border border-current/10 bg-current/10 rounded px-2 py-1 tabular-nums font-mono text-0.85em {loaded
						? ''
						: 'opacity-10'}"
				>
					Vol: {String(Math.round(volume * 10)).padStart(2, "0")}
				</div>
			</div>
		</div>
	</div>

	{#if sourcesOn}
		<!-- Input sources (docs/demo-recording.md, "Input sources"): each a toggle into the take with its meter, its settings menu joined to its right, and its gain (an outside source) or the instrument's own volume under it, as on the looper. -->
		<div class="mt-3 mb-3">
			<div class="device-button-group-label text-dark">Input Source</div>
			<div class="flex flex-wrap gap-2" role="group" aria-label="Sources in the take">
				{#each RECORDER_SOURCES as source (source)}
					<SourceButton
						label={RECORDER_SOURCE_LABELS[source]}
						iconClass={source === "drums" ? null : SOURCE_ICONS[source]}
						pressed={sourcesOn[source]}
						disabled={busy}
						title={sourcesOn[source]
							? `${(isOutside(source) ? inputSources.labels[source] : null) ?? RECORDER_SOURCE_LABELS[source]}: in the take (press to leave it out)`
							: `${RECORDER_SOURCE_LABELS[source]}: out of the take (press to record it)`}
						level={isOutside(source) ? inputSources.levels[source] : instLevels[source]}
						onclick={() => void toggleSource(source)}
						menu={source === "mic"
							? micMenu
							: source === "line"
								? lineMenu
								: source === "computer"
									? computerMenu
									: undefined}
					>
						{#snippet icon()}
							{#if source === "drums"}<IconDrumKit />{/if}
						{/snippet}
						{#snippet below()}
							{#if isOutside(source)}
								<label
									class="block px-0.5"
									title="Input gain: {inputSources.inputGainsDb[source] > 0 ? '+' : ''}{inputSources
										.inputGainsDb[source]} dB"
								>
									<span class="sr-only">{RECORDER_SOURCE_LABELS[source]} gain</span>
									<input
										class="w-full accent-maximumYellow h-3"
										type="range"
										min="-12"
										max="24"
										step="1"
										value={inputSources.inputGainsDb[source]}
										aria-label="{RECORDER_SOURCE_LABELS[source]} gain in decibels"
										oninput={(e) =>
											inputSources.setInputGainDb(source, Number(e.currentTarget.value))}
									/>
									<span
										class="block text-11px leading-none text-dark/80 text-center -mt-0.5"
										aria-hidden="true"
										>Gain {inputSources.inputGainsDb[source] > 0 ? "+" : ""}{inputSources
											.inputGainsDb[source]} dB</span
									>
								</label>
							{:else}
								{@const inst = source === "piano" ? piano : drumMachine}
								<label
									class="block px-0.5"
									title="{RECORDER_SOURCE_LABELS[source]} volume: {Math.round(inst.volume * 100)}%"
								>
									<span class="sr-only">{RECORDER_SOURCE_LABELS[source]} volume</span>
									<input
										class="w-full accent-maximumYellow h-3"
										type="range"
										min="0"
										max="100"
										step="1"
										value={Math.round(inst.volume * 100)}
										aria-label="{RECORDER_SOURCE_LABELS[source]} volume in percent"
										oninput={(e) => inst.setVolume(Number(e.currentTarget.value) / 100)}
									/>
									<span
										class="block text-11px leading-none text-dark/80 text-center -mt-0.5"
										aria-hidden="true">Volume {Math.round(inst.volume * 100)}%</span
									>
								</label>
							{/if}
						{/snippet}
					</SourceButton>
				{/each}
			</div>
		</div>
	{/if}

	<!-- the controls: Record (or Stop), Play, the take menu -->
	<div class="flex items-center flex-wrap gap-3">
		<!-- Always in place, disabled until there is a take, so the panel keeps its shape. -->
		{#if true}
			<label class="w-full grid grid-cols-1 items-center gap-2 text-sm opacity-90 mb-2">
				<!-- <span class="i-ph-play flex" aria-hidden="true"></span> -->
				<span class="sr-only">Position</span>
				<input
					type="range"
					class="
						accent-slate-800
						appearance-none
						bg-oxford-950
						cursor-pointer
						h-1
						w-full
					 shadow-sm
						rounded-full
						bg-oxford-950

						[&::-webkit-slider-thumb]:appearance-none
				    [&::-webkit-slider-thumb]:size-5
				    [&::-webkit-slider-thumb]:-mt-.5
				    [&::-webkit-slider-thumb]:rounded-full
				    [&::-webkit-slider-thumb]:bg-slate-800
				    [&::-webkit-slider-thumb]:shadow
				    [&::-webkit-slider-thumb]:transition-transform
				    [&::-webkit-slider-thumb]:hover:scale-110
						"
					min="0"
					max={takeLength || 0}
					step="0.1"
					value={playhead}
					disabled={!takeLength}
					oninput={(e) => (playhead = Number(e.currentTarget.value))}
					aria-label="Position"
					aria-valuetext="{formatTime(playhead, 0)} of {formatTime(takeLength, 0)}"
				/>
			</label>
		{/if}

		<!-- record / stop button -->
		<div class="device-window-bezel-sm">
			<button
				class="device-button-lg {phase === 'recording'
					? 'device-button-stop'
					: 'device-button-record'}"
				onclick={phase === "recording" ? stop : start}
				disabled={withSources && !anySourceOn && phase !== "recording"}
				title={phase === "recording"
					? "Stop Recording"
					: withSources && !anySourceOn
						? "Switch on a source first"
						: loaded
							? "Record the next take"
							: "Record a take"}
				type="button"
			>
				{phase === "recording" ? "Stop" : "Record"}
			</button>
		</div>

		<!-- Back to the beginning button -->
		<div class="device-window-bezel-sm">
			<button
				class="device-button-lg device-button-skip-back !max-w-fit !min-w-fit"
				type="button"
				disabled={!(hasTake && loaded)}
				aria-label="Go back to the beginning"
				title="Go back to the beginning"
				onclick={() => {
					playhead = 0;
					playbackPaused = true;
				}}
			>
			</button>
		</div>

		<!-- play / pause button -->
		<div class="device-window-bezel-sm">
			<button
				class="device-button-lg {playbackPaused
					? 'device-button-play'
					: 'device-button-pause'}  !max-w-fit !min-w-fit"
				type="button"
				disabled={!hasTake}
				aria-label={playbackPaused ? "Play the take" : "Pause the take"}
				title={playbackPaused ? "Play the take" : "Pause the take"}
				onclick={togglePlayback}
			>
			</button>
		</div>

		<div
			class="hidden @xl-block ml-2 text-12px text-oxford uppercase text-shadow opacity-90 font-600 select-none pointer-events-none"
		>
			SS Recorder 001
		</div>

		<!--right-aligned -->
		<div class="ml-auto flex gap-3">
			<!-- volume up and down -->
			<!-- Phones keep playback volume on the hardware buttons (iOS ignores a software control), so this is for larger screens. -->
			<div class="hidden @xl-grid device-window-bezel-sm grid-cols-2 gap-x-1 gap-y-0">
				<button
					class="device-button-bump-down !max-w-fit !min-w-fit text-slate-800"
					type="button"
					aria-label="Volume down"
					title="Volume down"
					onclick={() => {
						volume = volume <= 0 ? 0 : Math.round((volume - 0.1) * 10) / 10;
					}}
				>
				</button>

				<button
					class="block device-button-bump-up !max-w-fit !min-w-fit text-slate-800"
					type="button"
					aria-label="Volume up"
					title="Volume up"
					onclick={() => {
						volume = volume < 1 ? Math.round((volume + 0.1) * 10) / 10 : 1;
					}}
				>
				</button>
			</div>

			<!-- toggle loopMode -->
			<div class="device-window-bezel-sm">
				<button
					class="device-button-lg device-button-loop !max-w-fit !min-w-fit"
					type="button"
					disabled={!hasTake}
					aria-label="Toggle looping playback mode"
					title="Toggle looping playback mode"
					onclick={() => {
						loopMode = loopMode === "looping" ? "not-looping" : "looping";
					}}
				>
				</button>
			</div>
			<!-- context menu -->
			<div class="device-window-bezel-sm ml-auto">
				<ContextMenu
					bind:openState={contextMenuOpen}
					buttonClasses="bg-slate-800 hover-bg-slate-900 h-38.5px shadow-sm {contextMenuOpen ===
					'open'
						? 'text-blue-100'
						: 'text-blue-100/80'} hover-text-blue-100"
					items={[
						{
							id: "saving-notice",
							kind: "notice",
							condition: phase === "saved" && !!loaded && isLocal(loaded.id),
							notice: "Saving… song actions follow in a moment",
						},
						{
							id: "browse-ideas",
							label: "Browse All Ideas",
							iconClass: "i-ph-magnifying-glass",
							kind: "button",
							popovertarget: "idea-search",
						},
						{
							id: "divider-0",
							kind: "divider",
						},
						{
							id: "add-to-song",
							label: "Add to Existing Song",
							iconClass: "i-ph-plus-circle",
							disabled: !(onaddtosong && phase === "saved" && loaded !== null),
							action: () => {
								if (loaded) onaddtosong?.(loaded);
							},
						},
						{
							id: "create-new-song",
							label: "Create New Song",
							iconClass: "i-ph-music-notes-plus",
							disabled: !(onnewsong && phase === "saved" && loaded !== null),
							kind: "button",
							action: () => {
								if (loaded) onnewsong?.(loaded);
							},
						},
						{
							id: "add-stems",
							label: "Add Stems to Song",
							iconClass: "i-ph-stack",
							title: "The take's sources (microphone, piano, drums) onto a song as separate stems",
							disabled: !(
								onaddstems &&
								phase === "saved" &&
								loaded !== null &&
								(loaded.stems?.length ?? 0) > 0
							),
							kind: "button",
							action: () => {
								if (loaded) onaddstems?.(loaded);
							},
						},
						{
							id: "divider-1",
							kind: "divider",
						},
						{
							id: "download-take-source",
							label: sourceLabel,
							title: loaded?.codec
								? `Download the high-fidelity source audio file in (${loaded.codec}) format`
								: "Source file is not yet available",
							iconClass: "i-ph-download-simple",
							disabled: phase !== "saved" || loaded === null,
							// The file keeps the container it was recorded in: .webm on Chrome (Opus), .m4a on Safari.
							action: () => download("source"),
						},
						{
							id: "download-mp3",
							label: `Download MP3`,
							iconClass: "i-ph-download-simple",
							disabled: phase !== "saved" || !loaded?.playbackUrl,
							title: loaded?.playbackUrl
								? "The 192 kbit/s MP3 made for playback"
								: "The MP3 is not yet available",
							action: () => download("mp3"),
						},
						{
							id: "divider-2",
							kind: "divider",
						},
						{
							id: "delete-take",
							label: "Delete Take",
							iconClass: "i-ph-trash-simple",
							disabled: !(ondeletetake && loaded && !isLocal(loaded.id)),
							// The page deletes and then shows the previous take (or empties the player): only it knows the outcome.
							action: () => {
								if (loaded) ondeletetake?.(loaded);
							},
						},
						{
							id: "delete-idea",
							label: "Delete Idea",
							iconClass: "i-ph-trash-simple",
							// The idea in the player, takes or not; never mid-take.
							disabled: !ondeleteidea || busy,
							action: () => ondeleteidea?.(),
						},
						{
							id: "divider-3",
							kind: "divider",
						},
						{
							id: "new-idea",
							label: "Start New Idea",
							iconClass: "i-ph-plus",
							disabled: false,
							action: () => onnewidea?.(),
						},
					]}
				></ContextMenu>
			</div>
		</div>
	</div>
</div>

{#if !supported}
	<p class="rounded border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm" role="alert">
		This browser cannot record audio. Try Safari, Chrome or Firefox.
	</p>
{/if}

{#snippet micMenu()}
	<InputSourceSettings source="mic" />
{/snippet}
{#snippet lineMenu()}
	<InputSourceSettings source="line" />
{/snippet}
{#snippet computerMenu()}
	<InputSourceSettings source="computer" />
{/snippet}
