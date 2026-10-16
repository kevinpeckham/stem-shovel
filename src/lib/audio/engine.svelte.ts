import { playThroughSilentSwitch } from "#lib/audio/playThroughSilentSwitch.js";
import { reorderById } from "#lib/utils/reorderById.js";
import { claimPlayback, releasePlayback } from "#lib/audio/onlyOnePlays.js";
import { collapseDualMono } from "./mono";
import { computeMixPeaks, computePeaks, PEAK_BINS } from "./peaks";
import type { EngineStatus, MixSnapshot, StemSource, StemState } from "./types";

/** Upper limit of a stem fader. Slight boost is handy when auditioning quiet parts. */
import { FADER_MAX } from "#lib/constants/fader.js";
import { MixHistory } from "#lib/utils/mixHistory.js";
import { STEM_MEMORY_SOFT_BYTES } from "#lib/constants/stemFormats.js";
import { formatBytes } from "#lib/utils/formatBytes.js";
import { stemMemoryBudget } from "#lib/utils/stemMemoryBudget.js";
import { METER_ZERO, nextMeter, type MeterState } from "#lib/utils/meterLevel.js";
import {
	stemPlaybackMode,
	type StemModeChoice,
	type StemPlaybackMode,
	type StemStreamingSetting,
} from "#lib/utils/stemPlaybackMode.js";
export { FADER_MAX };
/** Time constant for gain changes (seconds). ~15 ms avoids zipper noise without feeling laggy. */
const RAMP = 0.015;
/** Lead time before a scheduled start so every source.start() call lands before the deadline. */
const START_LEAD = 0.05;
/** Stems fetched + decoded at once while loading a song. */
const LOAD_CONCURRENCY = 3;
/** Streamed mode: seconds decoded ahead of the playhead per stem, and the context rate (the renditions' own). */
const STREAM_AHEAD = 12;
const STREAM_RATE = 48000;

/** The sessionStorage marker a load leaves until it finishes; one found at the next load of the same stems means the last did not. */
const LOAD_MARKER = "stemshovel.loading";
/** A marker older than this is a stale tab, not a crash. */
const LOAD_MARKER_FRESH_MS = 15 * 60 * 1000;

function readLoadMarker(sources: StemSource[]) {
	const key = sources
		.map((s) => s.id)
		.sort()
		.join(",");
	let died: { stems: number; bytes: number } | null = null;
	const storage = (): Storage | null => {
		try {
			return typeof sessionStorage === "undefined" ? null : sessionStorage;
		} catch {
			return null;
		}
	};
	try {
		const raw = storage()?.getItem(LOAD_MARKER);
		if (raw) {
			const m = JSON.parse(raw) as { key?: string; stems?: number; bytes?: number; at?: number };
			if (m.key === key && typeof m.at === "number" && Date.now() - m.at < LOAD_MARKER_FRESH_MS)
				died = { stems: m.stems ?? sources.length, bytes: m.bytes ?? 0 };
		}
	} catch {
		died = null;
	}
	return {
		died,
		write(stems: number, bytes: number) {
			try {
				storage()?.setItem(LOAD_MARKER, JSON.stringify({ key, stems, bytes, at: Date.now() }));
			} catch {
				// no storage: no marker
			}
		},
		clear() {
			try {
				storage()?.removeItem(LOAD_MARKER);
			} catch {
				// nothing to clear
			}
		},
	};
}

/** A mono stem's channel weights for a pan: unity both sides at center, the far side falling away on a sine. */
export function monoPan(pan: number): { left: number; right: number } {
	return {
		left: pan > 0 ? Math.cos((pan * Math.PI) / 2) : 1,
		right: pan < 0 ? Math.sin(((pan + 1) * Math.PI) / 2) : 1,
	};
}

/** The pan stage after a stem's gain (see `#panners`): `set` moves it with a ramp (tau 0 sets it at once). */
function makePanner(
	ctx: BaseAudioContext,
	from: AudioNode,
	to: AudioNode,
	mono: boolean,
): { output: AudioNode; set(pan: number, tau: number): void; disconnect(): void } {
	const at = (param: AudioParam, value: number, tau: number) => {
		param.cancelScheduledValues(ctx.currentTime);
		if (tau) param.setTargetAtTime(value, ctx.currentTime, tau);
		else param.value = value;
	};
	if (!mono) {
		const panner = ctx.createStereoPanner();
		from.connect(panner);
		panner.connect(to);
		return {
			output: panner,
			set: (pan, tau) => at(panner.pan, pan, tau),
			disconnect: () => panner.disconnect(),
		};
	}
	const left = ctx.createGain();
	const right = ctx.createGain();
	const merger = ctx.createChannelMerger(2);
	from.connect(left);
	from.connect(right);
	left.connect(merger, 0, 0);
	right.connect(merger, 0, 1);
	merger.connect(to);
	return {
		output: merger,
		set: (pan, tau) => {
			const w = monoPan(pan);
			at(left.gain, w.left, tau);
			at(right.gain, w.right, tau);
		},
		disconnect: () => {
			left.disconnect();
			right.disconnect();
			merger.disconnect();
		},
	};
}

/** The stems' upload-time peaks summed and clamped, the streamed mode's stand-in for the mix waveform (no buffers to sum). */
function sumPeaks(peaks: number[][]): number[] {
	const bins = peaks.reduce((max, p) => Math.max(max, p.length), 0);
	if (!bins || peaks.some((p) => p.length !== bins)) return [];
	const out = Array.from({ length: bins }, () => 0);
	for (const p of peaks) for (let i = 0; i < bins; i++) out[i] = Math.min(1, out[i]! + (p[i] ?? 0));
	return out;
}

/** A warning to Sentry with what the load was carrying; the import is lazy so tests and SSR never load it. */
async function report(message: string, extra: Record<string, unknown>): Promise<void> {
	try {
		const Sentry = await import("@sentry/sveltekit");
		Sentry.captureMessage(message, { level: "warning", extra });
	} catch {
		// no Sentry here
	}
}
/** Waveform resolution. 1024 bins ≈ 8 KB as JSON, which is fine to store per stem. */

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** One undo step of the mix: every stem's fader, pan, mute and solo, and the master. */
interface MixSnap {
	master: number;
	stems: { id: string; gain: number; pan: number; muted: boolean; soloed: boolean }[];
}

/**
 * Multi-stem playback engine on a single AudioContext.
 *
 * Sync strategy: every stem is decoded to an AudioBuffer up front, then on
 * play() all sources are scheduled against the same `when` timestamp on the
 * shared context clock. That is sample-accurate by construction — there is
 * no per-stem clock to drift.
 *
 * Runes ($state/$derived) make the public fields reactive so Svelte
 * components can read `engine.position` etc. directly. Everything that
 * touches Web Audio is kept in private (#) fields.
 */
export class StemEngine {
	status = $state<EngineStatus>("idle");
	error = $state<string | null>(null);
	loaded = $state(0); // stems decoded so far
	total = $state(0); // stems requested
	playing = $state(false);
	position = $state(0); // seconds; updated every animation frame while playing
	duration = $state(0); // longest stem, seconds
	master = $state(1);
	stems = $state<StemState[]>([]);
	/** Waveform of every stem summed, filled once all of them are decoded. */
	mixPeaks = $state.raw<number[]>([]);
	/**
	 * How the stems play (docs/stem-streaming.md): "buffered" holds every
	 * stem decoded; "streamed" decodes a window around the playhead in a
	 * worker and mixes in one worklet, so a song of any size fits.
	 */
	mode = $state<StemPlaybackMode>("buffered");
	/** Streamed and waiting for a stem's window to fill (a seek, a slow network); the counter is stopped. */
	buffering = $state(false);
	/**
	 * The meters (docs/stem-engine.md, "Meters"): each stem's level after its
	 * fader and pan, and the master's after the master gain, with a peak-hold
	 * mark and a clip memory that sticks until `resetClips`. Replaced whole
	 * every frame while playing (and a moment after), so rows read
	 * `engine.levels[id]`.
	 */
	levels = $state.raw<Record<string, MeterState>>({});
	masterLevel = $state.raw<MeterState>(METER_ZERO);

	anySolo = $derived(this.stems.some((s) => s.soloed));
	decodedBytes = $derived(this.stems.reduce((sum, s) => sum + s.decodedBytes, 0));
	/** What the stems will take once decoded: the manifest's duration and channels until each has decoded, then the real figure. */
	estimatedBytes = $derived(
		this.mode === "streamed"
			? this.stems.length * (STREAM_AHEAD + 1) * STREAM_RATE * 2 * 4
			: this.stems.reduce(
					(sum, s) =>
						sum +
						(s.decoded
							? s.decodedBytes
							: (s.duration ?? 0) * (s.channels ?? 0) * this.#sampleRate * 4),
					0,
				),
	);
	/**
	 * The last attempt to load these same stems in this tab never finished
	 * (docs/audio-engine.md, "When the browser runs out of memory"): the marker
	 * `load()` writes to sessionStorage was still there when it began again,
	 * which is what a tab killed for memory and reloaded looks like.
	 */
	lastLoadDied = $state<{ stems: number; bytes: number } | null>(null);
	/**
	 * Undo for the mix (utils/mixHistory.ts): one step per gesture over the
	 * faders, pans, mutes, solos and master, from the rows, the Stage or the
	 * keys alike. Cleared by a load (the local mix put on top of a fresh
	 * load is the starting point, not a move).
	 */
	canUndoMix = $state(false);
	canRedoMix = $state(false);
	#mixHistory = new MixHistory<MixSnap>();
	/** Set while a snapshot is being restored, so the setters do not record it. */
	#restoringMix = false;

	#ctx: AudioContext | null = null;
	#masterNode: GainNode | null = null;
	#buffers = new Map<string, AudioBuffer>();
	#gains = new Map<string, GainNode>();
	/**
	 * Buffered mode's pan after each stem's gain (the worklet pans itself when
	 * streamed): a StereoPannerNode for a stereo buffer; for a mono one a pair
	 * of gains into a merger, so it sits at unity in both channels at center
	 * as it did before pans (a StereoPannerNode would drop it 3 dB) and the
	 * far channel falls away on a sine as it turns (`monoPan`).
	 */
	#panners = new Map<
		string,
		{ output: AudioNode; set(pan: number, tau: number): void; disconnect(): void }
	>();
	#sources = new Map<string, AudioBufferSourceNode>(); // live only while playing
	#startedAt = 0; // ctx.currentTime at which the current run was scheduled
	#offset = 0; // track position (s) the current run started from, or the paused position
	#raf = 0;
	readonly #sampleRate: number;
	// The streamed mode's parts (docs/stem-streaming.md): the decode worker, the mixer worklet, and the
	// playhead as the worklet last reported it (in its samples, with the context time of the report).
	#worker: Worker | null = null;
	#mixer: AudioWorkletNode | null = null;
	#generation = 0;
	#streamSample = 0;
	#streamReportedAt = 0;
	/** The worklet has reported its counter moving since play or the last seek: only then does the clock run it forward. */
	#streamRunning = false;
	#manifest: StemSource[] = [];
	#analyser: AnalyserNode | null = null;
	/** Buffered mode: an analyser per stem after its pan; streamed mode: the worklet's last reported peaks. */
	#stemAnalysers = new Map<string, AnalyserNode>();
	#streamPeaks: {
		stems: Record<string, number>;
		master: number;
		rms: Record<string, number>;
		masterRms: number;
	} = { stems: {}, master: 0, rms: {}, masterRms: 0 };
	#meterFrame = 0;
	#meterAt = 0;
	#meterBuf: Float32Array<ArrayBuffer> | null = null;

	/**
	 * @param sampleRate Context rate. decodeAudioData resamples into it, so 32 kHz
	 * roughly quarters the memory of 44.1 kHz stereo while sounding fine for review.
	 */
	constructor(sampleRate = 32000) {
		this.#sampleRate = sampleRate;
	}

	/** Lazily create the context — must not run during SSR. */
	#context(sampleRate = this.#sampleRate): AudioContext {
		if (this.#ctx) return this.#ctx;
		const ctx = new AudioContext({ sampleRate, latencyHint: "playback" });
		const master = ctx.createGain();
		master.connect(ctx.destination);
		// The output meter (meter()): made here so a first reading is not an empty frame.
		const analyser = ctx.createAnalyser();
		analyser.fftSize = 2048;
		master.connect(analyser);
		this.#analyser = analyser;
		this.#ctx = ctx;
		this.#masterNode = master;
		return ctx;
	}

	/**
	 * Load the stems: the rows appear at once from what the manifest knows,
	 * then either every file is fetched and decoded (buffered) or a worker
	 * and a worklet stream them (docs/stem-streaming.md), as the listener's
	 * choice, the site's setting and the device's budget decide
	 * (utils/stemPlaybackMode). A streamed load that fails before it is
	 * ready falls back to buffered.
	 */
	async load(
		sources: StemSource[],
		options: { choice?: StemModeChoice | null; site?: StemStreamingSetting; ahead?: number } = {},
	): Promise<void> {
		this.#reset();
		this.status = "loading";
		this.total = sources.length;
		this.loaded = 0;
		this.#manifest = sources;

		// Rows appear immediately from what the manifest knows (duration, peaks
		// recorded at upload); each is filled in as its file decodes. Playback
		// waits for all of them — a partial mix is not the song.
		this.stems = sources.map((src) => ({
			id: src.id,
			label: src.label,
			gain: clamp(src.gain ?? 1, 0, FADER_MAX),
			pan: clamp(src.pan ?? 0, -1, 1),
			tint: src.tint ?? null,
			muted: false,
			soloed: false,
			duration: src.duration ?? 0,
			channels: src.channels ?? 0,
			collapsed: false,
			decodedBytes: 0,
			peaks: src.peaks ?? [],
			decoded: false,
		}));
		this.duration = this.stems.reduce((max, s) => Math.max(max, s.duration), 0);

		const capable =
			typeof AudioDecoder !== "undefined" &&
			typeof AudioWorkletNode !== "undefined" &&
			typeof Worker !== "undefined" &&
			typeof MessageChannel !== "undefined";
		this.mode = "buffered";
		const mode = stemPlaybackMode({
			estimate: this.estimatedBytes,
			budget: stemMemoryBudget(
				typeof navigator === "undefined"
					? null
					: (navigator as { deviceMemory?: number }).deviceMemory,
			),
			choice: options.choice ?? null,
			site: options.site ?? "auto",
			capable,
		});
		if (mode === "streamed") {
			this.mode = "streamed";
			try {
				await this.#loadStreamed(sources, options.ahead ?? STREAM_AHEAD);
				return;
			} catch (e) {
				const message = e instanceof Error ? e.message : String(e);
				void report(`Streamed load fell back to buffered: ${message}`, {
					stems: sources.length,
				});
				this.#teardownStream();
				this.mode = "buffered";
				for (const stem of this.stems) stem.decoded = false;
				this.loaded = 0;
			}
		}
		await this.#loadBuffered(sources);
	}

	/**
	 * Fetch and decode every stem, LOAD_CONCURRENCY at a time. A few in flight
	 * overlaps network with decoding; more only raises peak memory (compressed +
	 * decoded data is held for every file in flight) without finishing sooner.
	 */
	async #loadBuffered(sources: StemSource[]): Promise<void> {
		const ctx = this.#context();
		const master = this.#masterNode as GainNode;
		const marker = readLoadMarker(sources);
		if (marker.died) {
			this.lastLoadDied = { stems: marker.died.stems, bytes: marker.died.bytes };
			void report("Stem load did not finish last time (likely out of memory)", {
				stems: marker.died.stems,
				bytes: marker.died.bytes,
			});
		}
		marker.write(sources.length, this.estimatedBytes);

		const loadOne = async (src: StemSource) => {
			const res = await fetch(src.url);
			if (!res.ok) throw new Error(`${src.label}: ${res.status} ${res.statusText} for ${src.url}`);
			const bytes = await res.arrayBuffer();
			const decoded = await ctx.decodeAudioData(bytes);
			// Dual-mono files keep one channel; the decoded original is released.
			const buffer = collapseDualMono(decoded, ctx);

			const gain = ctx.createGain();
			const panner = makePanner(ctx, gain, master, buffer.numberOfChannels === 1);
			panner.set(this.stems.find((s) => s.id === src.id)?.pan ?? 0, 0);
			this.#buffers.set(src.id, buffer);
			this.#gains.set(src.id, gain);
			this.#panners.set(src.id, panner);
			// The stem's meter taps the pan's output: what this stem puts into the sum.
			const analyser = ctx.createAnalyser();
			analyser.fftSize = 1024;
			panner.output.connect(analyser);
			this.#stemAnalysers.set(src.id, analyser);

			const stem = this.stems.find((s) => s.id === src.id);
			if (stem) {
				stem.duration = buffer.duration;
				stem.channels = buffer.numberOfChannels;
				stem.collapsed = decoded.numberOfChannels === 2 && buffer.numberOfChannels === 1;
				stem.decodedBytes = buffer.length * buffer.numberOfChannels * 4;
				stem.peaks = Array.from(computePeaks(buffer, PEAK_BINS));
				stem.decoded = true;
			}
			this.duration = this.stems.reduce((max, s) => Math.max(max, s.duration), 0);
			this.loaded += 1;
		};

		try {
			const queue = [...sources];
			const workers = Array.from({ length: Math.min(LOAD_CONCURRENCY, queue.length) }, async () => {
				for (let src = queue.shift(); src; src = queue.shift()) await loadOne(src);
			});
			await Promise.all(workers);
			this.mixPeaks = Array.from(computeMixPeaks([...this.#buffers.values()], PEAK_BINS));
			this.#applyGains(true);
			this.status = "ready";
			marker.clear();
		} catch (e) {
			marker.clear();
			this.status = "error";
			const message = e instanceof Error ? e.message : String(e);
			// A decode that fails with nothing wrong with the file, on a big song, is the browser out of memory.
			const memory =
				e instanceof RangeError ||
				/memory|allocat/i.test(message) ||
				this.estimatedBytes > STEM_MEMORY_SOFT_BYTES;
			this.error = memory
				? `${message}. The browser may have run out of memory: ${sources.length} stems, about ${formatBytes(this.estimatedBytes)} once decoded. Try it on a computer, or with fewer stems.`
				: message;
			void report(`Stem load failed: ${message}`, {
				stems: sources.length,
				bytes: this.estimatedBytes,
				loaded: this.loaded,
				memory,
			});
		}
	}

	/**
	 * The streamed mode (docs/stem-streaming.md): the mixer worklet on the
	 * context, the decode worker, and a MessageChannel between them for the
	 * chunks; this thread only steers. Resolves when every stem has opened
	 * (its rendition's index read, its decoder found), and primes the first
	 * window so play is instant. Throws when a stem cannot be streamed here.
	 */
	async #loadStreamed(sources: StemSource[], ahead: number): Promise<void> {
		const ctx = this.#context(STREAM_RATE);
		const master = this.#masterNode as GainNode;
		await ctx.audioWorklet.addModule("/worklets/stem-mixer.js");
		const mixer = new AudioWorkletNode(ctx, "stem-mixer", {
			numberOfInputs: 0,
			numberOfOutputs: 1,
			outputChannelCount: [2],
		});
		mixer.connect(master);
		mixer.port.onmessage = (e) => this.#fromMixer(e.data);
		this.#mixer = mixer;
		const worker = new Worker(new URL("./streamWorker.ts", import.meta.url), { type: "module" });
		this.#worker = worker;
		const channel = new MessageChannel();
		mixer.port.postMessage({ type: "port", port: channel.port1 }, [channel.port1]);
		worker.postMessage({ type: "port", port: channel.port2 }, [channel.port2]);
		mixer.port.postMessage({ type: "stems", ids: sources.map((s) => s.id) });
		this.#applyGains(true);
		await new Promise<void>((resolve, reject) => {
			let ready = false;
			worker.onmessage = (e: MessageEvent) => {
				const m = e.data;
				if (m.type === "stem") {
					const stem = this.stems.find((s) => s.id === m.id);
					if (stem) {
						stem.duration = m.duration;
						stem.channels = m.channels;
						stem.decoded = true;
					}
					this.duration = this.stems.reduce((max, s) => Math.max(max, s.duration), 0);
					this.loaded += 1;
				} else if (m.type === "ready") {
					ready = true;
					resolve();
				} else if (m.type === "error") {
					const label = this.stems.find((s) => s.id === m.id)?.label ?? "a stem";
					if (!ready) reject(new Error(`${label}: ${m.message}`));
					else {
						// Mid-play: the network or the decoder gave out; stop rather than play a partial mix.
						this.pause();
						this.error = `${label}: ${m.message}`;
						void report(`Stream failed: ${m.message}`, { stems: sources.length });
					}
				}
			};
			worker.onerror = (ev) => {
				if (!ready) reject(new Error(ev.message || "The decode worker failed"));
			};
			worker.postMessage({
				type: "load",
				rate: ctx.sampleRate,
				ahead,
				stems: sources.map((s) => ({ id: s.id, url: s.url })),
			});
		});
		this.mixPeaks = sumPeaks(this.stems.map((s) => s.peaks));
		this.status = "ready";
		this.#seekStream(0);
	}

	#fromMixer(m: { type: string; sample?: number; generation?: number; buffering?: boolean }): void {
		const ctx = this.#ctx;
		if (!ctx) return;
		if (m.type === "position") {
			if (m.generation !== this.#generation) return;
			if (this.playing && (m.sample ?? 0) > this.#streamSample) this.#streamRunning = true;
			this.#streamSample = m.sample ?? 0;
			this.#streamReportedAt = ctx.currentTime;
		} else if (m.type === "levels") {
			const levels = m as unknown as {
				stems: Record<string, number>;
				master: number;
				rms?: Record<string, number>;
				masterRms?: number;
			};
			// The highest since the last frame read it: a transient between frames still lights the clip.
			for (const [id, peak] of Object.entries(levels.stems))
				this.#streamPeaks.stems[id] = Math.max(this.#streamPeaks.stems[id] ?? 0, peak);
			for (const [id, rms] of Object.entries(levels.rms ?? {}))
				this.#streamPeaks.rms[id] = Math.max(this.#streamPeaks.rms[id] ?? 0, rms);
			this.#streamPeaks.masterRms = Math.max(this.#streamPeaks.masterRms, levels.masterRms ?? 0);
			this.#streamPeaks.master = Math.max(this.#streamPeaks.master, levels.master);
		} else if (m.type === "state") {
			this.buffering = !!m.buffering;
			if (this.buffering) this.#streamReportedAt = ctx.currentTime;
		} else if (m.type === "ended") {
			releasePlayback(this.#transport);
			cancelAnimationFrame(this.#raf);
			this.playing = false;
			this.#offset = this.duration;
			this.position = this.duration;
		}
	}

	#seekStream(seconds: number): void {
		const ctx = this.#ctx;
		if (!ctx || !this.#mixer || !this.#worker) return;
		this.#generation += 1;
		const sample = Math.round(seconds * ctx.sampleRate);
		this.#streamSample = sample;
		this.#streamReportedAt = ctx.currentTime;
		this.#streamRunning = false;
		this.#mixer.port.postMessage({ type: "seek", sample, generation: this.#generation });
		this.#worker.postMessage({ type: "seek", seconds, generation: this.#generation });
	}

	#teardownStream(): void {
		this.#worker?.postMessage({ type: "dispose" });
		this.#worker?.terminate();
		this.#worker = null;
		this.#mixer?.port.postMessage({ type: "pause" });
		this.#mixer?.disconnect();
		this.#mixer = null;
		this.buffering = false;
	}

	/** This player as the page's one transport (onlyOnePlays): starting it stops the drums or the metronome. */
	#transport = { stop: () => this.pause() };

	async play(): Promise<void> {
		if (this.status !== "ready" || this.playing) return;
		claimPlayback(this.#transport);
		const ctx = this.#context();
		// iOS plays media through the ring/silent switch but not Web Audio: ask for the media rules.
		playThroughSilentSwitch();
		// Browsers (iOS especially) start contexts suspended until a user gesture.
		if (ctx.state !== "running") await ctx.resume();
		if (this.#offset >= this.duration) this.#offset = 0;
		if (this.mode === "streamed") {
			// The worklet primes from where it is (a seek or the load already asked the worker to decode there).
			if (this.#streamSample !== Math.round(this.#offset * ctx.sampleRate))
				this.#seekStream(this.#offset);
			this.#streamRunning = false;
			this.#mixer?.port.postMessage({ type: "play" });
			this.playing = true;
			this.#tick();
			this.#startMeters();
			return;
		}

		const when = ctx.currentTime + START_LEAD;
		for (const stem of this.stems) {
			const buffer = this.#buffers.get(stem.id);
			const gain = this.#gains.get(stem.id);
			if (!buffer || !gain) continue;
			// A shorter stem that has already ended at this offset simply doesn't play.
			if (this.#offset >= buffer.duration) continue;

			// Source nodes are one-shot: a fresh one per run.
			const source = ctx.createBufferSource();
			source.buffer = buffer;
			source.connect(gain);
			source.start(when, this.#offset);
			this.#sources.set(stem.id, source);
		}
		this.#startedAt = when;
		this.playing = true;
		this.#tick();
		this.#startMeters();
	}

	pause(): void {
		if (!this.playing) return;
		releasePlayback(this.#transport);
		this.#offset = this.#currentPosition();
		if (this.mode === "streamed") this.#mixer?.port.postMessage({ type: "pause" });
		this.#stopSources();
		cancelAnimationFrame(this.#raf);
		this.playing = false;
		this.position = this.#offset;
	}

	/** The rows in a new order (a member's drag, or a refreshed manifest); the audio graph does not care. */
	reorder(ids: string[]): void {
		const next = reorderById(this.stems, ids);
		if (next.some((s, i) => s !== this.stems[i])) this.stems = next;
	}

	toggle(): void {
		if (this.playing) this.pause();
		else void this.play();
	}

	/** Seeking = stop every source and reschedule from the new offset. */
	seek(seconds: number): void {
		if (this.status !== "ready") return;
		const target = clamp(seconds, 0, this.duration);
		if (this.mode === "streamed") {
			// The worklet re-primes and runs on if it was playing; the generation drops the old chunks.
			this.#offset = target;
			this.position = target;
			this.#seekStream(target);
			return;
		}
		const wasPlaying = this.playing;
		if (wasPlaying) {
			this.#stopSources();
			cancelAnimationFrame(this.#raf);
			this.playing = false;
		}
		this.#offset = target;
		this.position = target;
		if (wasPlaying) void this.play();
	}

	/** Pan a stem, -1 (left) to 1 (right); the same 15 ms ramp as the faders. */
	setPan(id: string, value: number): void {
		const stem = this.stems.find((s) => s.id === id);
		if (!stem) return;
		this.#rememberMix();
		stem.pan = clamp(value, -1, 1);
		const ctx = this.#ctx;
		if (!ctx) return;
		if (this.mode === "streamed") {
			this.#mixer?.port.postMessage({ type: "pan", id, value: stem.pan });
			return;
		}
		this.#panners.get(id)?.set(stem.pan, RAMP);
	}

	setGain(id: string, value: number): void {
		const stem = this.stems.find((s) => s.id === id);
		if (!stem) return;
		this.#rememberMix();
		stem.gain = clamp(value, 0, FADER_MAX);
		this.#applyGains();
	}

	toggleMute(id: string): void {
		const stem = this.stems.find((s) => s.id === id);
		if (!stem) return;
		this.#rememberMix();
		stem.muted = !stem.muted;
		this.#applyGains();
	}

	toggleSolo(id: string): void {
		const stem = this.stems.find((s) => s.id === id);
		if (!stem) return;
		this.#rememberMix();
		stem.soloed = !stem.soloed;
		this.#applyGains();
	}

	setMaster(value: number): void {
		this.#rememberMix();
		this.master = clamp(value, 0, 1);
		const ctx = this.#ctx;
		const node = this.#masterNode;
		if (!ctx || !node) return;
		node.gain.cancelScheduledValues(ctx.currentTime);
		node.gain.setTargetAtTime(this.master, ctx.currentTime, RAMP);
	}

	#rememberMix(): void {
		if (this.#restoringMix) return;
		if (this.#mixHistory.remember(() => this.#mixSnap(), performance.now())) this.#syncMixHistory();
	}
	#mixSnap(): MixSnap {
		return {
			master: this.master,
			stems: this.stems.map((s) => ({
				id: s.id,
				gain: s.gain,
				pan: s.pan,
				muted: s.muted,
				soloed: s.soloed,
			})),
		};
	}
	#applyMixSnap(snap: MixSnap): void {
		this.#restoringMix = true;
		try {
			for (const m of snap.stems) {
				const stem = this.stems.find((s) => s.id === m.id);
				if (!stem) continue;
				this.setGain(m.id, m.gain);
				this.setPan(m.id, m.pan);
				if (stem.muted !== m.muted) this.toggleMute(m.id);
				if (stem.soloed !== m.soloed) this.toggleSolo(m.id);
			}
			this.setMaster(snap.master);
		} finally {
			this.#restoringMix = false;
		}
	}
	#syncMixHistory(): void {
		this.canUndoMix = this.#mixHistory.canUndo;
		this.canRedoMix = this.#mixHistory.canRedo;
	}
	/** The mix as it was before the last gesture (a drag, a knob turn, a mute…). */
	undoMix(): void {
		const snap = this.#mixHistory.undo(() => this.#mixSnap());
		if (snap) this.#applyMixSnap(snap);
		this.#syncMixHistory();
	}
	redoMix(): void {
		const snap = this.#mixHistory.redo(() => this.#mixSnap());
		if (snap) this.#applyMixSnap(snap);
		this.#syncMixHistory();
	}
	/** Forget the mix's history: after a load, once the listener's own mix is on it. */
	clearMixHistory(): void {
		this.#mixHistory.clear();
		this.#syncMixHistory();
	}

	/**
	 * Drop one stem without touching the others: its source (if playing), gain
	 * and buffer go, the track length shrinks if it was the longest. Used when
	 * a stem is removed on the server so the rest need not be decoded again.
	 */
	remove(id: string): void {
		const source = this.#sources.get(id);
		if (source) {
			try {
				source.stop();
			} catch {
				// never started / already ended
			}
			source.disconnect();
			this.#sources.delete(id);
		}
		this.#gains.get(id)?.disconnect();
		this.#gains.delete(id);
		this.#panners.get(id)?.disconnect();
		this.#panners.delete(id);
		this.#stemAnalysers.get(id)?.disconnect();
		this.#stemAnalysers.delete(id);
		this.#buffers.delete(id);
		if (this.mode === "streamed") {
			this.#mixer?.port.postMessage({ type: "remove", id });
			this.#worker?.postMessage({ type: "remove", id });
			this.#manifest = this.#manifest.filter((s) => s.id !== id);
		}
		this.stems = this.stems.filter((s) => s.id !== id);
		this.duration = this.stems.reduce((max, s) => Math.max(max, s.duration), 0);
		if (this.#offset > this.duration) this.seek(this.duration);
		this.#applyGains();
	}

	/** The decoded stems, for analysis (tempo, key) without fetching anything again. Empty until ready, and in streamed mode. */
	buffers(): AudioBuffer[] {
		return [...this.#buffers.values()];
	}

	/**
	 * Every stem decoded, for the analyses that need whole buffers (Scan
	 * stems, Detect chords): the held buffers when buffered; in streamed mode
	 * each rendition is fetched and decoded now, at the buffered rate, held
	 * only as long as the caller keeps them (docs/stem-streaming.md).
	 */
	async decodedBuffers(): Promise<AudioBuffer[]> {
		if (this.mode !== "streamed") return this.buffers();
		const out: AudioBuffer[] = [];
		for (const src of this.#manifest) {
			const res = await fetch(src.url);
			if (!res.ok) throw new Error(`${src.label}: ${res.status} ${res.statusText}`);
			const scratch = new OfflineAudioContext(1, 1, this.#sampleRate);
			out.push(await scratch.decodeAudioData(await res.arrayBuffer()));
		}
		return out;
	}

	/**
	 * What is audible right now, for a server mixdown: each stem's effective
	 * gain (fader, mute and solo folded in; silent stems left out) and master.
	 */
	mix(): MixSnapshot {
		return {
			master: this.master,
			stems: this.stems
				.map((s) => ({ id: s.id, gain: this.#effectiveGain(s), pan: s.pan }))
				.filter((s) => s.gain > 0),
		};
	}

	/**
	 * The output's peak over the last analyser frame, 0 to 1: what is coming
	 * out of the master, whichever mode plays it (the browser tests check the
	 * streamed mode makes sound). The analyser is made on first use.
	 */
	meter(): number {
		if (!this.#analyser) return 0;
		const data = new Float32Array(this.#analyser.fftSize);
		this.#analyser.getFloatTimeDomainData(data);
		let peak = 0;
		for (const v of data) peak = Math.max(peak, Math.abs(v));
		return peak;
	}

	/** Forget a stem's clip (or every stem's and the master's, with no id); the lights go out. */
	resetClips(id?: string): void {
		const next: Record<string, MeterState> = {};
		for (const [k, v] of Object.entries(this.levels))
			next[k] = id === undefined || k === id ? { ...v, clipped: false } : v;
		this.levels = next;
		if (id === undefined) this.masterLevel = { ...this.masterLevel, clipped: false };
	}

	/**
	 * The meter loop: each frame, every stem's peak since the last (the
	 * analyser's latest frame when buffered, the worklet's reports when
	 * streamed) and the master's, through `nextMeter` for the fall, the hold
	 * and the clip memory. Runs while playing and for two seconds after, so
	 * the bars fall to rest; the clips stay.
	 */
	#startMeters(): void {
		cancelAnimationFrame(this.#meterFrame);
		this.#meterAt = performance.now();
		this.#meterFrame = requestAnimationFrame(this.#meterStep);
	}
	#meterStep = (): void => {
		const ctx = this.#ctx;
		if (!ctx) return;
		const now = performance.now();
		const dt = Math.min(0.1, (now - this.#meterAt) / 1000);
		this.#meterAt = now;
		const t = now / 1000;
		const buf = (this.#meterBuf ??= new Float32Array(2048));
		/** The analyser's latest frame: its peak and its RMS (the Stage's halo), linear. */
		const readOf = (analyser: AnalyserNode | undefined): { peak: number; rms: number } => {
			if (!analyser) return { peak: 0, rms: 0 };
			analyser.getFloatTimeDomainData(buf);
			let peak = 0;
			let sq = 0;
			const n = analyser.fftSize;
			for (let i = 0; i < n; i++) {
				const x = buf[i]!;
				const v = Math.abs(x);
				if (v > peak) peak = v;
				sq += x * x;
			}
			return { peak, rms: Math.sqrt(sq / n) };
		};
		const NONE = { peak: 0, rms: 0 };
		const next: Record<string, MeterState> = {};
		let moving = false;
		for (const stem of this.stems) {
			const read = !this.playing
				? NONE
				: this.mode === "streamed"
					? {
							peak: this.#streamPeaks.stems[stem.id] ?? 0,
							rms: this.#streamPeaks.rms[stem.id] ?? 0,
						}
					: readOf(this.#stemAnalysers.get(stem.id));
			const state = nextMeter(this.levels[stem.id] ?? METER_ZERO, read.peak, t, dt, read.rms);
			next[stem.id] = state;
			if (state.level > 0 || state.hold > 0 || state.rms > 1e-4) moving = true;
		}
		this.levels = next;
		const masterRead = !this.playing
			? NONE
			: this.mode === "streamed"
				? {
						peak: this.#streamPeaks.master * this.master,
						rms: this.#streamPeaks.masterRms * this.master,
					}
				: readOf(this.#analyser ?? undefined);
		this.masterLevel = nextMeter(this.masterLevel, masterRead.peak, t, dt, masterRead.rms);
		this.#streamPeaks = { stems: {}, master: 0, rms: {}, masterRms: 0 };
		if (this.playing || moving || this.masterLevel.level > 0)
			this.#meterFrame = requestAnimationFrame(this.#meterStep);
	};

	/** The label is display-only; changing it never needs a reload. */
	relabel(id: string, label: string): void {
		const stem = this.stems.find((s) => s.id === id);
		if (stem) stem.label = label;
	}

	/** The tint is display-only too (constants/stemTints.ts). */
	retint(id: string, tint: string | null): void {
		const stem = this.stems.find((s) => s.id === id);
		if (stem) stem.tint = tint;
	}

	/** Release everything, including the AudioContext. Call from component teardown. */
	dispose(): void {
		this.#reset();
		this.#teardownStream();
		if (this.#ctx) void this.#ctx.close();
		this.#ctx = null;
		this.#masterNode = null;
		this.#analyser = null;
		this.status = "idle";
	}

	// ---- internals ---------------------------------------------------------

	/** Where the playhead is right now, derived from the context clock. */
	#currentPosition(): number {
		const ctx = this.#ctx;
		if (!ctx || !this.playing) return this.#offset;
		if (this.mode === "streamed") {
			// The worklet's counter as last reported, run forward on the context clock unless it is buffering.
			const since =
				this.buffering || !this.#streamRunning
					? 0
					: Math.max(0, ctx.currentTime - this.#streamReportedAt);
			return Math.min(this.duration, this.#streamSample / ctx.sampleRate + since);
		}
		// Before `when` has elapsed, currentTime < startedAt; clamp so we never go backwards.
		return this.#offset + Math.max(0, ctx.currentTime - this.#startedAt);
	}

	#tick = (): void => {
		const pos = this.#currentPosition();
		if (pos >= this.duration && this.mode !== "streamed") {
			// Reached the end: stop cleanly and park at the end so play() restarts from 0.
			this.#stopSources();
			this.playing = false;
			this.#offset = this.duration;
			this.position = this.duration;
			return;
		}
		this.position = pos;
		this.#raf = requestAnimationFrame(this.#tick);
	};

	#stopSources(): void {
		for (const source of this.#sources.values()) {
			try {
				source.stop();
			} catch {
				// stop() throws if the source never started or already ended — harmless
			}
			source.disconnect();
		}
		this.#sources.clear();
	}

	/** Mute wins; otherwise any solo silences everything not soloed. */
	#effectiveGain(stem: StemState): number {
		if (stem.muted) return 0;
		if (this.anySolo && !stem.soloed) return 0;
		return stem.gain;
	}

	/**
	 * Push fader/mute/solo state into the GainNodes.
	 * @param immediate Set values directly (initial load) instead of ramping.
	 */
	#applyGains(immediate = false): void {
		const ctx = this.#ctx;
		if (!ctx) return;
		if (this.mode === "streamed") {
			for (const stem of this.stems) {
				this.#mixer?.port.postMessage({
					type: "gain",
					id: stem.id,
					value: this.#effectiveGain(stem),
					immediate,
				});
				this.#mixer?.port.postMessage({ type: "pan", id: stem.id, value: stem.pan, immediate });
			}
			return;
		}
		const now = ctx.currentTime;
		for (const stem of this.stems) {
			const node = this.#gains.get(stem.id);
			if (!node) continue;
			const target = this.#effectiveGain(stem);
			if (immediate) {
				node.gain.value = target;
			} else {
				// Ramp instead of jumping to avoid clicks when muting mid-note.
				node.gain.cancelScheduledValues(now);
				node.gain.setTargetAtTime(target, now, RAMP);
			}
		}
	}

	#reset(): void {
		this.pause();
		cancelAnimationFrame(this.#raf);
		this.#teardownStream();
		this.#manifest = [];
		for (const node of this.#gains.values()) node.disconnect();
		this.#gains.clear();
		for (const node of this.#panners.values()) node.disconnect();
		this.#panners.clear();
		for (const node of this.#stemAnalysers.values()) node.disconnect();
		this.#stemAnalysers.clear();
		cancelAnimationFrame(this.#meterFrame);
		this.levels = {};
		this.masterLevel = METER_ZERO;
		this.#buffers.clear();
		this.stems = [];
		this.mixPeaks = [];
		this.duration = 0;
		this.position = 0;
		this.#offset = 0;
		this.error = null;
	}
}
