import { collapseDualMono } from "./mono";
import { computeMixPeaks, computePeaks, PEAK_BINS } from "./peaks";
import type { EngineStatus, MixSnapshot, StemSource, StemState } from "./types";

/** Upper limit of a stem fader. Slight boost is handy when auditioning quiet parts. */
export const FADER_MAX = 1.25;
/** Time constant for gain changes (seconds). ~15 ms avoids zipper noise without feeling laggy. */
const RAMP = 0.015;
/** Lead time before a scheduled start so every source.start() call lands before the deadline. */
const START_LEAD = 0.05;
/** Stems fetched + decoded at once while loading a song. */
const LOAD_CONCURRENCY = 3;
/** Waveform resolution. 1024 bins ≈ 8 KB as JSON, which is fine to store per stem. */

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

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

	anySolo = $derived(this.stems.some((s) => s.soloed));
	decodedBytes = $derived(this.stems.reduce((sum, s) => sum + s.decodedBytes, 0));

	#ctx: AudioContext | null = null;
	#masterNode: GainNode | null = null;
	#buffers = new Map<string, AudioBuffer>();
	#gains = new Map<string, GainNode>();
	#sources = new Map<string, AudioBufferSourceNode>(); // live only while playing
	#startedAt = 0; // ctx.currentTime at which the current run was scheduled
	#offset = 0; // track position (s) the current run started from, or the paused position
	#raf = 0;
	readonly #sampleRate: number;

	/**
	 * @param sampleRate Context rate. decodeAudioData resamples into it, so 32 kHz
	 * roughly quarters the memory of 44.1 kHz stereo while sounding fine for review.
	 */
	constructor(sampleRate = 32000) {
		this.#sampleRate = sampleRate;
	}

	/** Lazily create the context — must not run during SSR. */
	#context(): AudioContext {
		if (this.#ctx) return this.#ctx;
		const ctx = new AudioContext({ sampleRate: this.#sampleRate, latencyHint: "playback" });
		const master = ctx.createGain();
		master.connect(ctx.destination);
		this.#ctx = ctx;
		this.#masterNode = master;
		return ctx;
	}

	/**
	 * Fetch and decode every stem, LOAD_CONCURRENCY at a time. A few in flight
	 * overlaps network with decoding; more only raises peak memory (compressed +
	 * decoded data is held for every file in flight) without finishing sooner.
	 */
	async load(sources: StemSource[]): Promise<void> {
		this.#reset();
		this.status = "loading";
		this.total = sources.length;
		this.loaded = 0;

		const ctx = this.#context();
		const master = this.#masterNode as GainNode;

		// Rows appear immediately from what the manifest knows (duration, peaks
		// recorded at upload); each is filled in as its file decodes. Playback
		// waits for all of them — a partial mix is not the song.
		this.stems = sources.map((src) => ({
			id: src.id,
			label: src.label,
			gain: 1,
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

		const loadOne = async (src: StemSource) => {
			const res = await fetch(src.url);
			if (!res.ok) throw new Error(`${src.label}: ${res.status} ${res.statusText} for ${src.url}`);
			const bytes = await res.arrayBuffer();
			const decoded = await ctx.decodeAudioData(bytes);
			// Dual-mono files keep one channel; the decoded original is released.
			const buffer = collapseDualMono(decoded, ctx);

			const gain = ctx.createGain();
			gain.connect(master);
			this.#buffers.set(src.id, buffer);
			this.#gains.set(src.id, gain);

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
		} catch (e) {
			this.status = "error";
			this.error = e instanceof Error ? e.message : String(e);
		}
	}

	async play(): Promise<void> {
		if (this.status !== "ready" || this.playing) return;
		const ctx = this.#context();
		// Browsers (iOS especially) start contexts suspended until a user gesture.
		if (ctx.state !== "running") await ctx.resume();
		if (this.#offset >= this.duration) this.#offset = 0;

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
	}

	pause(): void {
		if (!this.playing) return;
		this.#offset = this.#currentPosition();
		this.#stopSources();
		cancelAnimationFrame(this.#raf);
		this.playing = false;
		this.position = this.#offset;
	}

	toggle(): void {
		if (this.playing) this.pause();
		else void this.play();
	}

	/** Seeking = stop every source and reschedule from the new offset. */
	seek(seconds: number): void {
		if (this.status !== "ready") return;
		const target = clamp(seconds, 0, this.duration);
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

	setGain(id: string, value: number): void {
		const stem = this.stems.find((s) => s.id === id);
		if (!stem) return;
		stem.gain = clamp(value, 0, FADER_MAX);
		this.#applyGains();
	}

	toggleMute(id: string): void {
		const stem = this.stems.find((s) => s.id === id);
		if (!stem) return;
		stem.muted = !stem.muted;
		this.#applyGains();
	}

	toggleSolo(id: string): void {
		const stem = this.stems.find((s) => s.id === id);
		if (!stem) return;
		stem.soloed = !stem.soloed;
		this.#applyGains();
	}

	setMaster(value: number): void {
		this.master = clamp(value, 0, 1);
		const ctx = this.#ctx;
		const node = this.#masterNode;
		if (!ctx || !node) return;
		node.gain.cancelScheduledValues(ctx.currentTime);
		node.gain.setTargetAtTime(this.master, ctx.currentTime, RAMP);
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
		this.#buffers.delete(id);
		this.stems = this.stems.filter((s) => s.id !== id);
		this.duration = this.stems.reduce((max, s) => Math.max(max, s.duration), 0);
		if (this.#offset > this.duration) this.seek(this.duration);
		this.#applyGains();
	}

	/**
	 * What is audible right now, for a server mixdown: each stem's effective
	 * gain (fader, mute and solo folded in; silent stems left out) and master.
	 */
	mix(): MixSnapshot {
		return {
			master: this.master,
			stems: this.stems
				.map((s) => ({ id: s.id, gain: this.#effectiveGain(s) }))
				.filter((s) => s.gain > 0),
		};
	}

	/** The label is display-only; changing it never needs a reload. */
	relabel(id: string, label: string): void {
		const stem = this.stems.find((s) => s.id === id);
		if (stem) stem.label = label;
	}

	/** Release everything, including the AudioContext. Call from component teardown. */
	dispose(): void {
		this.#reset();
		if (this.#ctx) void this.#ctx.close();
		this.#ctx = null;
		this.#masterNode = null;
		this.status = "idle";
	}

	// ---- internals ---------------------------------------------------------

	/** Where the playhead is right now, derived from the context clock. */
	#currentPosition(): number {
		const ctx = this.#ctx;
		if (!ctx || !this.playing) return this.#offset;
		// Before `when` has elapsed, currentTime < startedAt; clamp so we never go backwards.
		return this.#offset + Math.max(0, ctx.currentTime - this.#startedAt);
	}

	#tick = (): void => {
		const pos = this.#currentPosition();
		if (pos >= this.duration) {
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
		for (const node of this.#gains.values()) node.disconnect();
		this.#gains.clear();
		this.#buffers.clear();
		this.stems = [];
		this.mixPeaks = [];
		this.duration = 0;
		this.position = 0;
		this.#offset = 0;
		this.error = null;
	}
}
