import { tempoRatioOf, type TempoRatio } from "$lib/constants/tempo";
import { arpStepIndex } from "$lib/utils/arpStep";
import { arpChangeSteps, arpSwitchStep } from "$lib/utils/arpSwitch";
import { arpSwingDelay } from "$lib/utils/arpSwingDelay";
import { startLookahead } from "./lookahead";
import { metronome } from "./metronome.svelte";

/** The arpeggiator's step: notes per beat at the session tempo. */
export const ARP_RATES = [
	{ id: "4", label: "Quarter notes", perBeat: 1 },
	{ id: "8", label: "Eighth notes", perBeat: 2 },
	{ id: "8t", label: "Eighth-note triplets", perBeat: 3 },
	{ id: "16", label: "Sixteenth notes", perBeat: 4 },
] as const;
export type ArpRate = (typeof ARP_RATES)[number]["id"];
export const ARP_PATTERNS = [
	{ id: "up", label: "Up" },
	{ id: "down", label: "Down" },
	{ id: "updown", label: "Up and down" },
	{ id: "played", label: "As played" },
	{ id: "random", label: "Random" },
] as const;
export type ArpPattern = (typeof ARP_PATTERNS)[number]["id"];

/** What the arpeggiator plays through: an instrument's notes and its context. */
export interface ArpVoice {
	noteOn(midi: number, velocity: number): void;
	noteOff(midi: number): void;
	allOff(): void;
	output(): AudioNode;
}
/** The settings as a preset carries them (val/PianoPresetSchema.ts, ArpSettingsSchema). */
export interface ArpSettings {
	on: boolean;
	rate: ArpRate;
	pattern: ArpPattern;
	octaves: number;
	gate: number;
	latch: boolean;
	align?: boolean;
	alignBars?: 1 | 2;
	onBeat?: boolean;
	swing?: number;
	ratio?: TempoRatio;
	/** A single note plays as a chord (the piano). */
	guess?: boolean;
}
interface Held {
	notes: number[];
	velocity: number;
}

/**
 * An arpeggiator (docs/chord-player.md, "The arpeggiator"; docs/piano.md,
 * "Arpeggiator"): what is held plays one note at a time on a fixed grid of
 * the session tempo (metronome.bpm × tempoRatio, the session swing on the
 * odd steps), scheduled on the voice's AudioContext with a lookahead so
 * nothing drifts. The chord player and the piano each own one, with their
 * own voice and memory. Chords ("replace"): a new hold is a new chord, and
 * while the pattern runs it joins at the next change point (or the next
 * step when the press was just late), the old chord playing until then;
 * with Latch on a hold let go before its change point still takes over and
 * stays. Keys ("add"): a hold while others are held joins them at once (a
 * chord built up a key at a time); with nothing held it is a new chord, as
 * above. A grid that stopped within the last bar is still the grid, so a
 * chord let go and the next pressed a moment later lands on the beat too.
 * `T` tags what is held (a chord as the screen names it, a MIDI note), and
 * comes back as `latched` while the pattern plays on after release.
 */
export class Arpeggiator<T = unknown> {
	on = $state(false);
	rate = $state<ArpRate>("8");
	pattern = $state<ArpPattern>("up");
	octaves = $state(1);
	/** How much of each step the note sounds, 0.1 (staccato) to 1 (legato). */
	gate = $state(0.6);
	/** The pattern keeps running after the hold is let go, until the next chord or stop. */
	latch = $state(false);
	/** The pattern restarts at every bar (or two), dropping what was left, so it lands the same way each bar whatever the note count (Kevin); on by default. */
	align = $state(true);
	alignBars = $state<1 | 2>(1);
	/** Changes land on the beat: a new chord joins the running grid at the next change point. */
	onBeat = $state(true);
	/** The pattern's tempo as a ratio of the session's (docs/audio-engine.md, "One tempo for the page"). */
	tempoRatio = $state<TempoRatio>(1);
	/** A single held note plays as a chord (the owner's `expand` says which: the piano's key's triad), Kevin's trick for the piano; on by default where the owner can expand. */
	guess = $state(false);
	/** The note the pattern is on, for a readout; null when it is not running. */
	note = $state<number | null>(null);
	/** What the pattern keeps playing after its hold was let go (Latch), tagged by the owner. */
	latched = $state<T | null>(null);

	readonly #voice: ArpVoice;
	readonly #read: (name: string) => string | null;
	readonly #write: (name: string, value: string) => void;
	readonly #mode: "replace" | "add";
	readonly #expand: ((midi: number) => number[]) | null;
	#held: Map<string, Held> = new Map();
	#latched: Held | null = null;
	#stopLoop: (() => void) | null = null;
	/** The steps queued ahead (within the lookahead), each with its timers, so a change can take them back. */
	#queued: { step: number; timers: ReturnType<typeof setTimeout>[] }[] = [];
	/** The grid: step 0's time on the context's clock, and the next step to queue. */
	#origin = 0;
	#index = 0;
	/** The step the running pattern counts from: the grid's origin, or the change point the current chord joined at. */
	#base = 0;
	/** A hold made while the pattern runs, to take over at `step`; `released` when its hold went up first (with Latch on it still takes over, then stays). */
	#pending: {
		held: Map<string, Held>;
		step: number;
		base: number;
		tag?: T;
		released?: boolean;
	} | null = null;
	#ctx: AudioContext | null = null;
	/** When the pattern last stopped and its step length then, so a hold soon after joins the same grid. */
	#stoppedAt = -Infinity;
	#stoppedStep = 0;

	constructor(opts: {
		voice: ArpVoice;
		read: (name: string) => string | null;
		write: (name: string, value: string) => void;
		mode?: "replace" | "add";
		/** The chord a single held note stands for, for `guess`. */
		expand?: (midi: number) => number[];
	}) {
		this.#voice = opts.voice;
		this.#read = opts.read;
		this.#write = opts.write;
		this.#mode = opts.mode ?? "replace";
		this.#expand = opts.expand ?? null;
		this.guess = !!opts.expand;
	}
	/** Whether the owner can fill a single note out as a chord (the menu shows the switch then). */
	get canGuess(): boolean {
		return this.#expand !== null;
	}

	/** The remembered settings, once, in the browser. */
	load() {
		const read = this.#read;
		this.on = read("arp") === "1";
		const rate = read("arp-rate");
		if (rate && ARP_RATES.some((r) => r.id === rate)) this.rate = rate as ArpRate;
		const pattern = read("arp-pattern");
		if (pattern && ARP_PATTERNS.some((r) => r.id === pattern)) this.pattern = pattern as ArpPattern;
		const octaves = Number(read("arp-octaves"));
		if (Number.isInteger(octaves) && octaves >= 1 && octaves <= 3) this.octaves = octaves;
		const gate = Number(read("arp-gate"));
		if (Number.isFinite(gate) && gate >= 0.1 && gate <= 1) this.gate = gate;
		this.latch = read("arp-latch") === "1";
		this.align = read("arp-align") !== "0";
		this.onBeat = read("arp-on-beat") !== "0";
		if (read("arp-align-bars") === "2") this.alignBars = 2;
		this.tempoRatio = tempoRatioOf(Number(read("tempo-ratio"))) ?? 1;
		if (this.#expand) this.guess = read("arp-guess") !== "0";
	}

	/** The pattern plays on its own: something is latched. */
	get autoPlaying(): boolean {
		return this.latched !== null;
	}
	/** Anything held, latched or pending. */
	get active(): boolean {
		return this.#held.size > 0 || !!this.#latched || !!this.#pending || !!this.#stopLoop;
	}
	/** Whether `by` is in the arpeggiator's hands (held or pending), so its release belongs here. */
	holds(by: string): boolean {
		return this.#held.has(by) || !!this.#pending?.held.has(by);
	}
	/** What is held now, for an owner switching the arpeggiator off and letting the notes ring as they are. */
	heldNotes(): Held[] {
		return [...this.#held.values()];
	}

	/**
	 * Something into the arpeggiator. The first hold starts the grid on the
	 * press. Keys ("add") join what is held at once; a new chord, with
	 * changes on the beat, joins the grid at the next change point (or the
	 * next step when just late), the old chord playing until then; otherwise
	 * the pattern restarts on the press.
	 */
	hold(by: string, notes: number[], velocity: number, tag?: T) {
		if (this.#mode === "add" && this.#held.size > 0) {
			this.#held.set(by, { notes, velocity });
			if (!this.#stopLoop) this.#restart();
			return;
		}
		// A key pressed while the first is still waiting for its change point joins it there (a chord played in time, not one key replacing the last).
		if (this.#mode === "add" && this.#pending && !this.#pending.released) {
			this.#pending.held.set(by, { notes, velocity });
			return;
		}
		const running = !!this.#stopLoop && !!this.#ctx;
		const stepSec = this.#stepSeconds();
		// A grid that stopped within the last bar at this step length is still the grid: the new chord joins it at its change point.
		const rejoin =
			!running &&
			this.onBeat &&
			!!this.#ctx &&
			this.#stoppedStep === stepSec &&
			this.#ctx.currentTime - this.#stoppedAt < stepSec * arpChangeSteps(this.rate) * 4;
		if ((running || rejoin) && this.onBeat) {
			const ctx = this.#ctx!;
			const at = (ctx.currentTime - this.#origin) / stepSec;
			const changeSteps = arpChangeSteps(this.rate);
			const switchStep = arpSwitchStep(at, changeSteps, 0.5);
			// The pattern counts from the change point: a chord that waited starts on its first note; one that was just late lands in its place.
			const base = Math.floor(switchStep / changeSteps) * changeSteps;
			this.#pending = { held: new Map([[by, { notes, velocity }]]), step: switchStep, base, tag };
			if (rejoin) {
				this.#index = switchStep;
				this.#stopLoop = startLookahead(ctx, this.#schedule);
				return;
			}
			// Steps already queued from the change point on come back, to be queued again with the new chord.
			const keep = this.#queued.filter((q) => q.step < switchStep);
			for (const q of this.#queued)
				if (q.step >= switchStep) for (const t of q.timers) clearTimeout(t);
			this.#queued = keep;
			if (this.#index > switchStep) this.#index = switchStep;
			return;
		}
		this.#held.set(by, { notes, velocity });
		this.#latched = null;
		this.latched = null;
		this.#pending = null;
		this.#index = 0;
		this.#restart();
	}
	/** A hold let go: the last one latches (tagged) or ends the pattern; one let go before its change point takes over anyway under Latch, else its change is off. */
	release(by: string, tag?: T) {
		if (this.#pending?.held.has(by)) {
			if (this.latch) {
				this.#pending.released = true;
				this.#pending.tag = tag ?? this.#pending.tag;
				return;
			}
			this.#pending = null;
			if (this.#held.size === 0 && !this.#latched) this.stop();
			return;
		}
		const held = this.#held.get(by);
		this.#held.delete(by);
		if (this.#held.size === 0) {
			if (this.latch && held) {
				// Keys latch as the whole chord they made up (every key let go in turn); a chord latches as itself.
				this.#latched = this.#mode === "add" && this.#latchedSet ? this.#latchedSet : held;
				this.latched = tag ?? null;
			} else if (this.#pending) {
				// Let go with the next already pressed (legato): the old runs on until the new takes over at its step.
				this.#latched = held ?? null;
				this.latched = tag ?? null;
			} else this.stop();
		} else if (this.#mode === "add" && this.latch) {
			// A key up while others stay down: remember the chord so far, so letting go of the last key latches all of them.
			this.#latchedSet = {
				notes: [...(this.#latchedSet?.notes ?? []), ...(held?.notes ?? [])],
				velocity: held?.velocity ?? 0.8,
			};
		}
	}
	/** Keys ("add"): the notes let go under Latch while others stayed down, to latch as one chord with the last. */
	#latchedSet: Held | null = null;

	/** Everything held now (an owner switching the arpeggiator on with notes sounding), the pattern started afresh. */
	restartWith(entries: { by: string; notes: number[]; velocity: number }[]) {
		this.#held = new Map(entries.map((e) => [e.by, { notes: e.notes, velocity: e.velocity }]));
		this.#latched = null;
		this.latched = null;
		this.#pending = null;
		this.#latchedSet = null;
		this.#index = 0;
		this.#restart();
	}
	/** The pattern off and everything let go. */
	stop() {
		this.#stopLoop?.();
		this.#stopLoop = null;
		if (this.#ctx) {
			this.#stoppedAt = this.#ctx.currentTime;
			this.#stoppedStep = this.#stepSeconds();
		}
		this.#clearQueue();
		this.#held.clear();
		this.#latched = null;
		this.#latchedSet = null;
		this.latched = null;
		this.note = null;
		this.#pending = null;
		this.#voice.allOff();
	}

	/** The notes to cycle: every held chord's (or the latched one's), ascending, through the octaves, in the pattern's order. */
	#sequence(): { midi: number; velocity: number }[] {
		let sources = this.#held.size ? [...this.#held.values()] : this.#latched ? [this.#latched] : [];
		// One note alone, with guessing on: the chord it stands for.
		if (this.guess && this.#expand && sources.length === 1 && sources[0]!.notes.length === 1)
			sources = [{ notes: this.#expand(sources[0]!.notes[0]!), velocity: sources[0]!.velocity }];
		const seen = new Set<number>();
		const played: { midi: number; velocity: number }[] = [];
		for (const s of sources)
			for (const midi of [...s.notes].sort((a, b) => a - b))
				for (let o = 0; o < this.octaves; o++) {
					const m = midi + 12 * o;
					if (m > 127 || seen.has(m)) continue;
					seen.add(m);
					played.push({ midi: m, velocity: s.velocity });
				}
		const up = [...played].sort((a, b) => a.midi - b.midi);
		switch (this.pattern) {
			case "down":
				return up.reverse();
			case "updown":
				return up.length > 2 ? [...up, ...up.slice(1, -1).reverse()] : up;
			case "played":
				return played;
			default:
				return up;
		}
	}
	#stepSeconds(): number {
		const beat = 60 / (metronome.bpm * this.tempoRatio);
		return beat / (ARP_RATES.find((r) => r.id === this.rate)?.perBeat ?? 2);
	}
	#restart() {
		const ctx = this.#voice.output().context as AudioContext;
		this.#ctx = ctx;
		this.#clearQueue();
		this.#voice.allOff();
		this.#origin = ctx.currentTime + 0.01;
		this.#index = 0;
		this.#base = 0;
		if (!this.#stopLoop) this.#stopLoop = startLookahead(ctx, this.#schedule);
	}
	#clearQueue() {
		for (const q of this.#queued) for (const t of q.timers) clearTimeout(t);
		this.#queued = [];
	}
	#at(time: number, fn: () => void): ReturnType<typeof setTimeout> {
		const ctx = this.#ctx!;
		return setTimeout(fn, Math.max(0, (time - ctx.currentTime) * 1000));
	}
	#schedule = (until: number) => {
		const step = this.#stepSeconds();
		const perBeat = ARP_RATES.find((r) => r.id === this.rate)?.perBeat ?? 2;
		const stepsPerCycle = this.align ? metronome.beatsPerBar * perBeat * this.alignBars : null;
		let seq = this.#sequence();
		while (this.#origin + this.#index * step < until) {
			// A pending chord takes over from its step on.
			if (this.#pending && this.#index >= this.#pending.step) {
				const pending = this.#pending;
				this.#held = pending.held;
				this.#latched = null;
				this.latched = null;
				this.#latchedSet = null;
				this.#base = pending.base;
				this.#pending = null;
				if (pending.released) {
					// Its hold went up before now: it is the latched chord from here.
					const [first] = pending.held.values();
					this.#held = new Map();
					this.#latched = first ?? null;
					this.latched = pending.tag ?? null;
				}
				seq = this.#sequence();
			}
			if (seq.length === 0) {
				if (!this.#pending) this.stop();
				return;
			}
			// Keys may have joined or left since the last step.
			if (this.#mode === "add") seq = this.#sequence();
			const n = this.#index;
			// The pattern's position: from the chord's change point, restarted at every bar line when lined up.
			const barLine = stepsPerCycle ? Math.floor(n / stepsPerCycle) * stepsPerCycle : 0;
			const i =
				this.pattern === "random"
					? Math.floor(Math.random() * seq.length)
					: arpStepIndex(n - Math.max(this.#base, barLine), seq.length, null);
			const { midi, velocity } = seq[i];
			const at = this.#origin + n * step + arpSwingDelay(n, step, metronome.swing, perBeat);
			this.#queued.push({
				step: n,
				timers: [
					this.#at(at, () => {
						this.#voice.noteOn(midi, velocity);
						this.note = midi;
					}),
					this.#at(at + Math.max(0.03, step * this.gate), () => this.#voice.noteOff(midi)),
				],
			});
			if (this.#queued.length > 64) this.#queued = this.#queued.slice(-48);
			this.#index = n + 1;
		}
	};

	// ---- settings ----
	setOn(on: boolean) {
		this.on = on;
		this.#write("arp", on ? "1" : "0");
	}
	setRate(rate: ArpRate) {
		this.rate = rate;
		this.#write("arp-rate", rate);
	}
	setPattern(pattern: ArpPattern) {
		this.pattern = pattern;
		this.#write("arp-pattern", pattern);
	}
	setOctaves(n: number) {
		this.octaves = Math.max(1, Math.min(3, Math.round(n)));
		this.#write("arp-octaves", String(this.octaves));
	}
	setGate(g: number) {
		this.gate = Math.max(0.1, Math.min(1, Math.round(g * 100) / 100));
		this.#write("arp-gate", String(this.gate));
	}
	setTempoRatio(ratio: TempoRatio) {
		this.tempoRatio = ratio;
		this.#write("tempo-ratio", String(ratio));
	}
	setOnBeat(on: boolean) {
		this.onBeat = on;
		this.#write("arp-on-beat", on ? "1" : "0");
	}
	setAlign(on: boolean) {
		this.align = on;
		this.#write("arp-align", on ? "1" : "0");
	}
	setAlignBars(bars: 1 | 2) {
		this.alignBars = bars;
		this.#write("arp-align-bars", String(bars));
	}
	setLatch(on: boolean) {
		this.latch = on;
		this.#write("arp-latch", on ? "1" : "0");
		if (!on && this.#held.size === 0) this.stop();
	}
	setGuess(on: boolean) {
		this.guess = on;
		this.#write("arp-guess", on ? "1" : "0");
	}
	/** The settings as a preset keeps them (the swing is the session's). */
	settings(): ArpSettings {
		return {
			on: this.on,
			rate: this.rate,
			pattern: this.pattern,
			octaves: this.octaves,
			gate: this.gate,
			latch: this.latch,
			align: this.align,
			alignBars: this.alignBars,
			onBeat: this.onBeat,
			swing: metronome.swing,
			ratio: this.tempoRatio,
			...(this.#expand ? { guess: this.guess } : {}),
		};
	}
	/** A preset's settings in, all but `on`: the owner switches that, with its notes in hand. */
	apply(s: ArpSettings) {
		this.setRate(s.rate);
		this.setPattern(s.pattern);
		this.setOctaves(s.octaves);
		this.setGate(s.gate);
		this.setLatch(s.latch);
		if (s.align !== undefined) this.setAlign(s.align);
		if (s.alignBars !== undefined) this.setAlignBars(s.alignBars);
		if (s.onBeat !== undefined) this.setOnBeat(s.onBeat);
		if (s.swing !== undefined) metronome.setSwing(s.swing);
		if (s.ratio !== undefined) this.setTempoRatio(s.ratio);
		if (s.guess !== undefined && this.#expand) this.setGuess(s.guess);
	}
}
