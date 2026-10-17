import type { StemEngine } from "#lib/audio/engine.svelte.js";
import { startLookahead } from "#lib/audio/lookahead.js";
import { beatsPerBarAt, nextBeatAt, tempoAt, type BarGrid } from "#lib/audio/measures.js";

/**
 * A click in time with the stems (docs/stem-engine.md, "The click"): the
 * song's tempo and time signature as a metronome that plays on the stem
 * engine's own clock. Each beat is scheduled at the context time the
 * engine says that song second sounds (`engine.clockAt`), so the click
 * sits on the stems' samples through seeks, pauses and tempo changes; the
 * first beat of every bar is higher. The grid is read on every tick (a
 * settings save can change it under a playing song). Off by default and
 * never remembered, since a click nobody asked for is a shock; the level
 * is remembered per browser.
 */
const LEVEL_KEY = "stemshovel.clickLevel";
/** Bars of count-in before the stems start when the click is on (0 for none); a bar by default (Kevin). */
const COUNT_IN_KEY = "stemshovel.clickCountIn";
export const COUNT_IN_CHOICES = [0, 1, 2, 4] as const;
/** The clock's origin may drift by this much (the streamed counter's reports) before the beats are re-planned. */
const DRIFT_S = 0.005;

interface Scheduled {
	osc: OscillatorNode;
	at: number;
}

export class StemClick {
	on = $state(false);
	level = $state(0.6);
	/** Bars counted in before the stems start, when the click is on; 0 for none. */
	countIn = $state(1);
	/** A count-in is sounding: the stems start when it ends. */
	countingIn = $state(false);
	/** The beat sounding now (bar and beat), for an indicator; null between beats or off. */
	beat = $state<{ bar: number; beat: number } | null>(null);

	readonly #engine: StemEngine;
	readonly #gridOf: () => BarGrid | null;
	#stop: (() => void) | null = null;
	#gain: GainNode | null = null;
	#scheduled: Scheduled[] = [];
	/** The next song second to put a click on, or null when the plan must start again from the playhead. */
	#next: number | null = null;
	/** The clock's origin (context time of song second 0) the plan was made against. */
	#origin: number | null = null;
	#beatTimers: ReturnType<typeof setTimeout>[] = [];

	constructor(engine: StemEngine, gridOf: () => BarGrid | null) {
		this.#engine = engine;
		this.#gridOf = gridOf;
		try {
			const v = Number(localStorage.getItem(LEVEL_KEY));
			if (Number.isFinite(v) && v > 0 && v <= 1) this.level = v;
			const c = localStorage.getItem(COUNT_IN_KEY);
			if (c !== null && (COUNT_IN_CHOICES as readonly number[]).includes(Number(c)))
				this.countIn = Number(c);
		} catch {
			// no storage: the defaults
		}
		engine.prelude = (ctx, at) => this.#countInClicks(ctx, at);
	}

	setCountIn(bars: number): void {
		if (!(COUNT_IN_CHOICES as readonly number[]).includes(bars)) return;
		this.countIn = bars;
		try {
			localStorage.setItem(COUNT_IN_KEY, String(bars));
		} catch {
			// no storage: the choice lasts for this page
		}
	}

	/**
	 * The count-in (the engine's prelude): with the click on and bars to
	 * count, the beats of the bar in force at the playhead, from `at`, the
	 * first of each bar accented; the stems start as the last beat ends.
	 */
	#countInClicks(ctx: AudioContext, at: number): { seconds: number; cancel(): void } | null {
		const grid = this.#gridOf();
		if (!this.on || this.countIn <= 0 || !grid) return null;
		this.#ensureGain(ctx);
		const pos = this.#engine.position;
		const beat = 60 / tempoAt(grid, pos);
		const bpb = beatsPerBarAt(grid, pos);
		const n = this.countIn * bpb;
		const nodes: OscillatorNode[] = [];
		const timers: ReturnType<typeof setTimeout>[] = [];
		for (let k = 0; k < n; k++) {
			const t = at + k * beat;
			nodes.push(this.#tone(ctx, t, k % bpb === 0));
			timers.push(
				setTimeout(
					() => (this.beat = { bar: -(this.countIn - Math.floor(k / bpb)), beat: (k % bpb) + 1 }),
					Math.max(0, (t - ctx.currentTime) * 1000),
				),
			);
		}
		this.countingIn = true;
		const done = setTimeout(
			() => (this.countingIn = false),
			Math.max(0, (at + n * beat - ctx.currentTime) * 1000),
		);
		return {
			seconds: n * beat,
			cancel: () => {
				for (const o of nodes) {
					try {
						o.stop();
					} catch {
						// already stopped
					}
				}
				for (const t of timers) clearTimeout(t);
				clearTimeout(done);
				this.countingIn = false;
				this.beat = null;
			},
		};
	}

	/** Whether the song can carry a click: it has a tempo and a time signature. */
	get available(): boolean {
		return this.#gridOf() !== null;
	}

	setOn(on: boolean): void {
		if (this.on === on) return;
		this.on = on;
		if (on) this.#start();
		else this.#halt();
	}
	toggle(): void {
		this.setOn(!this.on);
	}
	setLevel(v: number): void {
		this.level = Math.max(0, Math.min(1, v));
		if (this.#gain && this.#engine.audioContext)
			this.#gain.gain.setTargetAtTime(this.level, this.#engine.audioContext.currentTime, 0.01);
		try {
			localStorage.setItem(LEVEL_KEY, String(this.level));
		} catch {
			// no storage: the level lasts for this page
		}
	}

	#ensureGain(ctx: AudioContext): GainNode {
		if (!this.#gain) {
			this.#gain = ctx.createGain();
			this.#gain.gain.value = this.level;
			this.#gain.connect(ctx.destination);
		}
		return this.#gain;
	}
	#start(): void {
		const ctx = this.#engine.audioContext;
		if (!ctx) return;
		this.#ensureGain(ctx);
		this.#stop?.();
		this.#stop = startLookahead(ctx, this.#queueUntil);
	}
	#halt(): void {
		this.#stop?.();
		this.#stop = null;
		this.#clear();
	}
	/** Drop every click not yet sounded and the plan behind it. */
	#clear(): void {
		const ctx = this.#engine.audioContext;
		const now = ctx?.currentTime ?? 0;
		for (const s of this.#scheduled)
			if (s.at > now) {
				try {
					s.osc.stop();
				} catch {
					// already stopped
				}
			}
		this.#scheduled = [];
		for (const t of this.#beatTimers) clearTimeout(t);
		this.#beatTimers = [];
		this.#next = null;
		this.#origin = null;
		this.beat = null;
	}

	#queueUntil = (until: number): void => {
		const engine = this.#engine;
		const ctx = engine.audioContext;
		const grid = this.#gridOf();
		if (!ctx || !grid || !engine.playing) {
			if (this.#scheduled.length || this.#next !== null) this.#clear();
			return;
		}
		// The lookahead started before the engine made its context: take the context it has now.
		if (!this.#gain) this.#start();
		const origin = engine.clockAt(0);
		if (origin === null) return;
		// A play or a seek moves the origin: plan again from where the playhead is.
		if (this.#origin === null || Math.abs(origin - this.#origin) > DRIFT_S) {
			this.#clear();
			this.#origin = origin;
			const pos = Math.max(0, ctx.currentTime - origin);
			this.#next = nextBeatAt(grid, pos).at;
		} else this.#origin = origin;
		while (this.#next !== null && this.#next <= engine.duration) {
			const at = origin + this.#next;
			if (at >= until) break;
			const { accent, bar, beat } = nextBeatAt(grid, this.#next);
			if (at >= ctx.currentTime - 0.002) this.#click(ctx, at, accent, bar, beat);
			this.#next = nextBeatAt(grid, this.#next + 1e-3).at;
		}
		this.#scheduled = this.#scheduled.filter((s) => s.at > ctx.currentTime - 1);
	};

	/** One click at `at`, through the level: an oscillator with a short envelope, the accent higher. */
	#tone(ctx: AudioContext, at: number, accent: boolean): OscillatorNode {
		const gain = this.#ensureGain(ctx);
		const osc = ctx.createOscillator();
		const env = ctx.createGain();
		osc.frequency.value = accent ? 1200 : 800;
		env.gain.setValueAtTime(0.0001, at);
		env.gain.exponentialRampToValueAtTime(accent ? 0.8 : 0.5, at + 0.002);
		env.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
		osc.connect(env).connect(gain);
		osc.start(at);
		osc.stop(at + 0.06);
		return osc;
	}
	#click(ctx: AudioContext, at: number, accent: boolean, bar: number, beat: number): void {
		const osc = this.#tone(ctx, at, accent);
		this.#scheduled.push({ osc, at });
		const delay = Math.max(0, (at - ctx.currentTime) * 1000);
		this.#beatTimers.push(setTimeout(() => (this.beat = { bar, beat }), delay));
		this.#beatTimers = this.#beatTimers.slice(-16);
	}

	dispose(): void {
		this.#engine.prelude = null;
		this.#halt();
		this.#gain?.disconnect();
		this.#gain = null;
	}
}
