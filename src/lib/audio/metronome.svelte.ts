import {
	loadMetronomePreferences,
	saveMetronomePreferences,
} from "$lib/utils/metronomePreferences";
import { claimPlayback, releasePlayback } from "$lib/audio/onlyOnePlays";
import { BPM_MAX, BPM_MIN, tapTempo } from "$lib/utils/tapTempo";
import { startLookahead } from "./lookahead";

/**
 * The one metronome on the page (docs/demo-recording.md): clicks from the
 * Web Audio clock, scheduled a tenth of a second ahead so a busy page never
 * makes it stumble, the first beat of the bar higher. Every Metronome
 * component is a view of this, so the toolbar's toggle and the one in a
 * phone's tools menu show the same click. Tempo and beats to the bar are
 * remembered per browser.
 */
class MetronomeEngine {
	bpm = $state(120);
	beatsPerBar = $state(4);
	/** The session swing (docs/audio-engine.md, "One tempo for the page"), 0 straight to 1 a triplet feel: the drums and the chord player follow it and set it; the click itself stays straight. */
	swing = $state(0);
	running = $state(false);
	/** The beat sounding now, 0-based, for an indicator; -1 between runs. */
	beat = $state(-1);

	#ctx: AudioContext | null = null;
	#stopLoop: (() => void) | null = null;
	#nextTime = 0;
	#nextBeat = 0;
	#visualTimers: ReturnType<typeof setTimeout>[] = [];
	#taps: number[] = [];
	#loaded = false;
	/** Who follows the tempo and the swing (the drum machine, the chord player), told on every change of either (docs/audio-engine.md, "One tempo for the page"). */
	#followers = new Set<() => void>();
	listen(fn: () => void): () => void {
		this.#followers.add(fn);
		return () => this.#followers.delete(fn);
	}

	/** Reads the remembered settings once, in the browser. */
	load() {
		if (this.#loaded || typeof localStorage === "undefined") return;
		this.#loaded = true;
		const p = loadMetronomePreferences();
		this.bpm = p.bpm;
		this.beatsPerBar = p.beatsPerBar;
		this.swing = p.swing;
	}
	#save() {
		saveMetronomePreferences({ bpm: this.bpm, beatsPerBar: this.beatsPerBar, swing: this.swing });
	}
	setSwing(v: number) {
		if (!Number.isFinite(v)) return;
		const swing = Math.min(1, Math.max(0, Math.round(v * 100) / 100));
		if (swing === this.swing) return;
		this.swing = swing;
		this.#save();
		for (const fn of this.#followers) fn();
	}

	#click(at: number, accent: boolean) {
		const ctx = this.#ctx;
		if (!ctx) return;
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.frequency.value = accent ? 1200 : 800;
		gain.gain.setValueAtTime(0.0001, at);
		gain.gain.exponentialRampToValueAtTime(accent ? 0.8 : 0.5, at + 0.002);
		gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
		osc.connect(gain).connect(ctx.destination);
		osc.start(at);
		osc.stop(at + 0.06);
	}
	#schedule = (until: number) => {
		const ctx = this.#ctx;
		if (!ctx) return;
		while (this.#nextTime < until) {
			const b = this.#nextBeat;
			this.#click(this.#nextTime, b === 0);
			const delay = Math.max(0, (this.#nextTime - ctx.currentTime) * 1000);
			this.#visualTimers.push(setTimeout(() => (this.beat = b), delay));
			this.#nextTime += 60 / this.bpm;
			this.#nextBeat = (b + 1) % this.beatsPerBar;
		}
		this.#visualTimers = this.#visualTimers.slice(-16);
	};

	/** Clicks in the host's context (the looper, docs/looper.md) instead of one of its own; `startAt` lines the clicks up with the host's bars. */
	hostContext(ctx: AudioContext) {
		this.#ctx = ctx;
		this.#hosted = true;
	}
	/** Hosted, the metronome is the host's click: the host holds the playback claim. */
	#hosted = false;
	async start() {
		return this.startAt(null);
	}
	/** Start with the first beat at a moment on the context's clock, or now with `null`. */
	async startAt(at: number | null) {
		if (this.running) return;
		if (!this.#hosted) claimPlayback(this);
		this.load();
		this.#ctx ??= new AudioContext();
		if (this.#ctx.state !== "running") await this.#ctx.resume().catch(() => {});
		this.#nextTime =
			at === null ? this.#ctx.currentTime + 0.05 : Math.max(at, this.#ctx.currentTime + 0.01);
		this.#nextBeat = 0;
		this.#stopLoop = startLookahead(this.#ctx, this.#schedule);
		this.running = true;
	}
	stop() {
		releasePlayback(this);
		this.#stopLoop?.();
		this.#stopLoop = null;
		for (const t of this.#visualTimers) clearTimeout(t);
		this.#visualTimers = [];
		this.beat = -1;
		this.running = false;
	}
	toggle() {
		if (this.running) this.stop();
		else void this.start();
	}

	setBpm(v: number) {
		if (!Number.isFinite(v)) return;
		const bpm = Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(v)));
		if (bpm === this.bpm) return;
		this.bpm = bpm;
		this.#save();
		for (const fn of this.#followers) fn();
	}
	setBeats(n: number) {
		this.beatsPerBar = n;
		this.#nextBeat = 0;
		this.#save();
	}
	/** Tap tempo: the average of the last taps sets the tempo. */
	tap() {
		this.#taps = [...this.#taps, performance.now()].slice(-8);
		const bpm = tapTempo(this.#taps);
		if (bpm) this.setBpm(bpm);
	}
}

export const metronome = new MetronomeEngine();
