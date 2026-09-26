import {
	loadMetronomePreferences,
	saveMetronomePreferences,
} from "$lib/utils/metronomePreferences";
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

	/** Reads the remembered settings once, in the browser. */
	load() {
		if (this.#loaded || typeof localStorage === "undefined") return;
		this.#loaded = true;
		const p = loadMetronomePreferences();
		this.bpm = p.bpm;
		this.beatsPerBar = p.beatsPerBar;
	}
	#save() {
		saveMetronomePreferences({ bpm: this.bpm, beatsPerBar: this.beatsPerBar });
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

	async start() {
		if (this.running) return;
		this.load();
		this.#ctx ??= new AudioContext();
		if (this.#ctx.state !== "running") await this.#ctx.resume().catch(() => {});
		this.#nextTime = this.#ctx.currentTime + 0.05;
		this.#nextBeat = 0;
		this.#stopLoop = startLookahead(this.#ctx, this.#schedule);
		this.running = true;
	}
	stop() {
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
		this.bpm = Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(v)));
		this.#save();
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
