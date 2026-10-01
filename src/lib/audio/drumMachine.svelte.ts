import {
	DEFAULT_DRUM_FX,
	DEFAULT_DRUM_SENDS,
	DRUM_BPM_MAX,
	DRUM_BPM_MIN,
	DRUM_MIDI_IN_NOTES,
	DRUM_VELOCITY_MAX,
	DRUM_VELOCITY_NORMAL,
	DRUM_VOICE_IDS,
	MAX_DRUM_PATTERNS,
	MAX_DRUM_ROWS,
	MAX_DRUM_TIMELINE,
	drumStepsFor,
	type DrumKitId,
	type DrumMeterId,
	type DrumSteps,
	type DrumSwingGrid,
	type DrumVoiceId,
} from "$lib/constants/drumMachine";
import type { DrumPreset } from "$lib/constants/drumPresets";
import { decodeDrumProject } from "$lib/utils/decodeDrumProject";
import {
	loadDrumMachinePreferences,
	saveDrumMachinePreferences,
} from "$lib/utils/drumMachinePreferences";
import { drumPresetProject } from "$lib/utils/drumPresetProject";
import { drumSwingDelay } from "$lib/utils/drumSwingDelay";
import { emptyDrumPattern } from "$lib/utils/emptyDrumPattern";
import { encodeDrumMidi } from "$lib/utils/encodeDrumMidi";
import { generateDrumPattern } from "$lib/utils/generateDrumPattern";
import type { DrumGeneratorStyle } from "$lib/constants/drumGenerator";
import { encodeDrumProject } from "$lib/utils/encodeDrumProject";
import { resizeDrumPattern } from "$lib/utils/resizeDrumPattern";
import { startingDrumProject } from "$lib/utils/startingDrumProject";
import { tapTempo } from "$lib/utils/tapTempo";
import type { DrumFx, DrumPattern, DrumProject } from "$lib/val/DrumPatternSchema";
import { createDrumBus, type DrumBus } from "./drumBus";
import {
	playDrumHit,
	playDrumStep,
	renderDrumPatternWav,
	renderDrumSongWav,
	type DrumPlayState,
} from "./drumRender";
import { drumKit } from "./kits";
import { startLookahead } from "./lookahead";
import { playThroughSilentSwitch } from "./playThroughSilentSwitch";
import { claimPlayback, releasePlayback } from "$lib/audio/onlyOnePlays";

/**
 * The one drum machine on the page (docs/drum-machine.md): a project of
 * patterns played from the Web Audio clock through the shared lookahead
 * loop, the kit's hits scheduled a tenth of a second ahead and the playing
 * step read back off the clock for the grid. One pattern is open for
 * editing; while playing, choosing another queues it for the end of the
 * cycle. In song mode the timeline decides instead: bar after bar, each
 * a pattern, round and round. The project is remembered per browser; a
 * share link in the URL's hash overrides it.
 */
class DrumMachineEngine {
	project = $state<DrumProject>(startingDrumProject());
	/** The pattern open in the grid. */
	current = $state(0);
	/** The pattern sounding; -1 between runs. */
	playing = $state(-1);
	/** A pattern chosen while another plays: it starts at the end of the cycle. */
	queued = $state<number | null>(null);
	/** Song mode: play the timeline's bars in order rather than looping the open pattern. On whenever a project with a timeline loads; off again when the timeline empties. */
	songMode = $state(false);
	/** Song mode: the timeline position sounding, 0-based; -1 between runs or in pattern mode. */
	bar = $state(-1);
	/** Song mode: a bar chosen while playing; the song jumps there at the end of the cycle. */
	queuedBar = $state<number | null>(null);
	/** Solo per row of the open pattern: a listening choice, not part of the project. */
	solo = $state<boolean[]>([]);
	running = $state(false);
	/** The step sounding now, 0-based; -1 between runs. */
	step = $state(-1);
	/** The current kit is decoded and ready (the acoustic one takes a moment on the first play). */
	kitReady = $state(false);
	/** The project as it was before the last preset loaded, until the next edit; `undoPreset` brings it back. */
	beforePreset = $state<DrumProject | null>(null);
	/** The name of the preset or saved beat the project is, untouched; null once edited (the readout then says Custom). */
	loadedName = $state<string | null>(null);

	/** Web MIDI in (docs/drum-machine.md, "MIDI input"): not asked yet, asked and refused or absent, or connected with the inputs' names. */
	midiIn = $state<{ status: "idle" | "unsupported" | "denied" | "on"; inputs: string[] }>({
		status: "idle",
		inputs: [],
	});
	/** The last pad hit, so the screen can say the controller is alive. */
	midiActivity = $state(0);
	/** While playing, a pad's hit also lands in the grid at the nearest step; off, pads only sound. Off to start: it writes into the beat. */
	midiRecord = $state(false);
	#access: MIDIAccess | null = null;
	#ctx: AudioContext | null = null;
	#bus: DrumBus | null = null;
	#stopLoop: (() => void) | null = null;
	#frame: number | null = null;
	#nextTime = 0;
	#nextStep = 0;
	/** Song mode: the timeline position the next cycle plays. */
	#nextBar = 0;
	#queuedSteps: { step: number; time: number; pattern: number; bar: number }[] = [];
	#play: DrumPlayState = { openHat: null };
	#taps: number[] = [];
	#loaded = false;

	get pattern(): DrumPattern {
		return this.project.patterns[this.current] ?? this.project.patterns[0]!;
	}

	/**
	 * Reads the remembered project, then a share link's, once, in the
	 * browser. `warm` fetches the sampled kit ahead of the first play, for
	 * the page that is about the drums; a page that merely offers them waits.
	 */
	/** Once per page: the remembered project, else `starting` when the page has one (the home page's demo beat), else what it opened with; a share link in the hash beats them all. */
	load(warm = false, starting: DrumProject | null = null) {
		if (this.#loaded || typeof window === "undefined") return;
		this.#loaded = true;
		const remembered = loadDrumMachinePreferences();
		if (remembered) this.project = remembered;
		else if (starting) this.project = starting;
		const hash = window.location.hash.slice(1);
		const shared = hash ? decodeDrumProject(hash) : null;
		if (shared) this.project = shared;
		this.current = 0;
		this.songMode = this.project.timeline.length > 0;
		this.#resetSolo();
		if (warm) drumKit(this.project.kit).warm();
	}
	/** Fetch the kit's samples ahead of the first play (the home page, as the demo scrolls into view). */
	warmKit() {
		drumKit(this.project.kit).warm();
	}
	#save() {
		this.beforePreset = null;
		this.loadedName = null;
		saveDrumMachinePreferences($state.snapshot(this.project));
	}
	#resetSolo() {
		this.solo = this.pattern.rows.map(() => false);
	}

	async #readyKit() {
		const ctx = this.#ctx;
		if (!ctx) return;
		this.kitReady = false;
		const kit = drumKit(this.project.kit);
		await kit.load(ctx);
		if (kit.id === this.project.kit) this.kitReady = true;
	}

	#queue = (until: number) => {
		const ctx = this.#ctx;
		const bus = this.#bus;
		if (!ctx || !bus) return;
		const timeline = this.project.timeline;
		const song = this.songMode && timeline.length > 0;
		let bar = -1;
		while (this.#nextTime < until) {
			// The top of the cycle: in song mode the next bar's pattern takes over, else a queued pattern.
			if (this.#nextStep === 0) {
				if (song) {
					if (this.queuedBar !== null) {
						this.#nextBar = this.queuedBar;
						this.queuedBar = null;
					}
					bar = this.#nextBar % timeline.length;
					this.playing = Math.min(timeline[bar]!, this.project.patterns.length - 1);
					this.#nextBar = bar + 1;
					this.queued = null;
				} else if (this.queued !== null) {
					this.playing = this.queued;
					this.queued = null;
				}
			}
			const index = Math.min(this.playing, this.project.patterns.length - 1);
			const pattern = this.project.patterns[index]!;
			const steps = pattern.steps;
			const s = this.#nextStep % steps;
			const stepSeconds = 60 / this.project.bpm / 4;
			// The step's straight time, plus swing's delay on the odd sixteenths.
			const at =
				this.#nextTime + drumSwingDelay(s, stepSeconds, this.project.swing, this.project.swingGrid);
			const solo = index === this.current ? this.solo : [];
			playDrumStep(
				ctx,
				drumKit(this.project.kit),
				bus,
				this.project,
				pattern,
				s,
				at,
				this.#play,
				solo,
			);
			this.#queuedSteps.push({ step: s, time: at, pattern: index, bar });
			this.#nextTime += stepSeconds;
			this.#nextStep = (s + 1) % steps;
		}
	};
	/** The grid follows the clock, not the scheduler: the step whose time has come. */
	#follow = () => {
		const ctx = this.#ctx;
		if (!ctx) return;
		let current = this.step;
		let bar = this.bar;
		while (this.#queuedSteps[0] && this.#queuedSteps[0].time <= ctx.currentTime) {
			const due = this.#queuedSteps.shift()!;
			current = due.step;
			// A step scheduled mid-cycle carries no bar of its own: the cycle's stands.
			if (due.bar >= 0) bar = due.bar;
		}
		if (current !== this.step) this.step = current;
		if (bar !== this.bar) this.bar = bar;
		this.#frame = requestAnimationFrame(this.#follow);
	};

	/** The context and the bus, made on the first play or pad hit (a gesture, as browsers require), the bus brought up to date. */
	async #graph(): Promise<{ ctx: AudioContext; bus: DrumBus }> {
		this.load();
		playThroughSilentSwitch();
		const ctx = (this.#ctx ??= new AudioContext());
		const bus = (this.#bus ??= createDrumBus(
			ctx,
			$state.snapshot(this.project.fx),
			this.project.bpm,
		));
		bus.update($state.snapshot(this.project.fx), this.project.bpm);
		if (ctx.state !== "running") await ctx.resume().catch(() => {});
		return { ctx, bus };
	}

	async start() {
		if (this.running) return;
		claimPlayback(this);
		const { ctx } = await this.#graph();
		this.running = true;
		this.playing = this.current;
		this.queued = null;
		if (!this.kitReady) await this.#readyKit();
		if (!this.running) return; // stopped while the kit loaded
		this.#nextTime = ctx.currentTime + 0.05;
		this.#nextStep = 0;
		this.#nextBar = 0;
		this.queuedBar = null;
		this.#queuedSteps = [];
		this.#stopLoop = startLookahead(ctx, this.#queue);
		this.#frame = requestAnimationFrame(this.#follow);
	}
	stop() {
		releasePlayback(this);
		this.#stopLoop?.();
		this.#stopLoop = null;
		if (this.#frame !== null) cancelAnimationFrame(this.#frame);
		this.#frame = null;
		this.#queuedSteps = [];
		this.step = -1;
		this.bar = -1;
		this.playing = -1;
		this.queued = null;
		this.queuedBar = null;
		this.running = false;
	}
	toggle() {
		if (this.running) this.stop();
		else void this.start();
	}

	// ---- patterns ----
	/** Open a pattern; while playing it is queued for the end of the cycle (choosing the playing one cancels a queue). */
	select(index: number) {
		if (!this.project.patterns[index]) return;
		this.current = index;
		this.#resetSolo();
		if (!this.running || (this.songMode && this.project.timeline.length > 0)) return;
		this.queued = index === this.playing ? null : index;
	}
	/** A new pattern in the open one's shape (its rows, every cell off), added at the end and opened. */
	addPattern(copy = false) {
		if (this.project.patterns.length >= MAX_DRUM_PATTERNS) return;
		const from = $state.snapshot(this.pattern);
		this.project.patterns.push(copy ? from : emptyDrumPattern(from));
		this.select(this.project.patterns.length - 1);
		this.#save();
	}
	removePattern(index: number) {
		if (this.project.patterns.length <= 1 || !this.project.patterns[index]) return;
		this.project.patterns.splice(index, 1);
		const last = this.project.patterns.length - 1;
		if (this.playing > index) this.playing -= 1;
		else if (this.playing === index) this.playing = Math.min(index, last);
		if (this.queued !== null) {
			if (this.queued > index) this.queued -= 1;
			else if (this.queued === index) this.queued = null;
		}
		this.current = Math.min(this.current > index ? this.current - 1 : this.current, last);
		// The timeline loses that pattern's bars; later patterns shift down.
		this.project.timeline = this.project.timeline
			.filter((bar) => bar !== index)
			.map((bar) => (bar > index ? bar - 1 : bar));
		this.#nextBar = 0;
		this.queuedBar = null;
		if (this.project.timeline.length === 0) this.songMode = false;
		this.#resetSolo();
		this.#save();
	}

	// ---- the timeline: a song of bars ----
	/** The pattern at each bar, an index past the end standing for the last pattern (as the player treats it). */
	get bars(): DrumPattern[] {
		const last = this.project.patterns.length - 1;
		return this.project.timeline.map((bar) => this.project.patterns[Math.min(bar, last)]!);
	}
	/** Song mode, when there is a song to play: what Play does, and what the downloads and a demo carry. */
	get playsSong(): boolean {
		return this.songMode && this.project.timeline.length > 0;
	}
	setSongMode(on: boolean) {
		this.songMode = on;
		this.#nextBar = 0;
		this.queuedBar = null;
		this.queued = null;
		if (!on) this.bar = -1;
	}
	/** A bar at the end of the timeline, of the open pattern unless another is named; the first bar turns song mode on. */
	appendBar(pattern = this.current) {
		if (this.project.timeline.length >= MAX_DRUM_TIMELINE || !this.project.patterns[pattern])
			return;
		this.project.timeline.push(pattern);
		if (this.project.timeline.length === 1) this.setSongMode(true);
		this.#save();
	}
	removeBar(position: number) {
		if (position < 0 || position >= this.project.timeline.length) return;
		this.project.timeline.splice(position, 1);
		if (this.queuedBar !== null && this.queuedBar >= this.project.timeline.length)
			this.queuedBar = null;
		if (this.project.timeline.length === 0) this.setSongMode(false);
		this.#save();
	}
	/** A bar one place earlier or later. */
	moveBar(position: number, delta: -1 | 1) {
		const t = this.project.timeline;
		const to = position + delta;
		if (!t[position] && t[position] !== 0) return;
		if (to < 0 || to >= t.length) return;
		[t[position], t[to]] = [t[to]!, t[position]!];
		this.#save();
	}
	clearTimeline() {
		this.project.timeline = [];
		this.setSongMode(false);
		this.#save();
	}
	/** Go to a bar: while the song plays, at the end of the cycle; otherwise it is where Play starts. Opens its pattern. */
	goToBar(position: number) {
		const pattern = this.project.timeline[position];
		if (pattern === undefined) return;
		this.select(Math.min(pattern, this.project.patterns.length - 1));
		if (this.running && this.playsSong) this.queuedBar = position;
		else this.#nextBar = position;
	}

	// ---- the open pattern ----
	/** Off and normal, the plain tap. */
	toggleCell(row: number, step: number) {
		const cells = this.pattern.rows[row]?.cells;
		if (!cells) return;
		cells[step] = cells[step] ? 0 : DRUM_VELOCITY_NORMAL;
		this.#save();
	}
	setCell(row: number, step: number, on: boolean) {
		const cells = this.pattern.rows[row]?.cells;
		if (!cells || Boolean(cells[step]) === on) return;
		cells[step] = on ? DRUM_VELOCITY_NORMAL : 0;
		this.#save();
	}
	/** A sounding cell's velocity, round the loop: normal, accent, ghost. */
	cycleVelocity(row: number, step: number) {
		const cells = this.pattern.rows[row]?.cells;
		if (!cells || !cells[step]) return;
		this.setVelocity(row, step, (cells[step]! % DRUM_VELOCITY_MAX) + 1);
	}
	setVelocity(row: number, step: number, velocity: number) {
		const cells = this.pattern.rows[row]?.cells;
		if (!cells || step >= cells.length) return;
		cells[step] = Math.min(DRUM_VELOCITY_MAX, Math.max(0, Math.round(velocity)));
		this.#save();
	}
	setBpm(v: number) {
		if (!Number.isFinite(v)) return;
		this.project.bpm = Math.min(DRUM_BPM_MAX, Math.max(DRUM_BPM_MIN, Math.round(v)));
		this.#save();
		this.#bus?.update($state.snapshot(this.project.fx), this.project.bpm);
	}
	/** The effects: the delay's time, feedback, return and analog character, the reverb's size and return, the fuzz's drive and tone, the wah's bars, range, resonance and mix. */
	setFx(patch: Partial<DrumFx>) {
		const fx = { ...this.project.fx, ...patch };
		fx.delayFeedback = Math.min(0.9, Math.max(0, Math.round(fx.delayFeedback * 100) / 100));
		for (const k of [
			"delayReturn",
			"reverbSize",
			"reverbReturn",
			"fuzzDrive",
			"fuzzTone",
			"wahRange",
			"wahResonance",
			"wahMix",
		] as const)
			fx[k] = Math.min(1, Math.max(0, Math.round(fx[k] * 100) / 100));
		fx.delayAnalog = fx.delayAnalog === true;
		this.project.fx = fx;
		this.#save();
		this.#bus?.update($state.snapshot(this.project.fx), this.project.bpm);
	}
	/** The effects back to their defaults: master levels at zero, every row in every pattern sending its voice's usual amount. */
	resetFx() {
		this.project.fx = { ...DEFAULT_DRUM_FX };
		for (const p of this.project.patterns)
			for (const r of p.rows) Object.assign(r, DEFAULT_DRUM_SENDS[r.voice]);
		this.#save();
		this.#bus?.update($state.snapshot(this.project.fx), this.project.bpm);
	}
	setSend(row: number, which: "delaySend" | "reverbSend", v: number) {
		const r = this.pattern.rows[row];
		if (!r || !Number.isFinite(v)) return;
		r[which] = Math.min(1, Math.max(0, Math.round(v * 100) / 100));
		this.#save();
	}
	/** Tap tempo: the average of the last taps sets the tempo. */
	tap() {
		this.#taps = [...this.#taps, performance.now()].slice(-8);
		const bpm = tapTempo(this.#taps);
		if (bpm) this.setBpm(bpm);
	}
	setSwing(v: number) {
		if (!Number.isFinite(v)) return;
		this.project.swing = Math.min(1, Math.max(0, Math.round(v * 100) / 100));
		this.#save();
	}
	setSwingGrid(grid: DrumSwingGrid) {
		this.project.swingGrid = grid;
		this.#save();
	}
	setHumanize(v: number) {
		if (!Number.isFinite(v)) return;
		this.project.humanize = Math.min(1, Math.max(0, Math.round(v * 100) / 100));
		this.#save();
	}
	setSteps(steps: DrumSteps) {
		if (!drumStepsFor(this.pattern.meter).includes(steps)) return;
		this.project.patterns[this.current] = resizeDrumPattern($state.snapshot(this.pattern), steps);
		this.#save();
	}
	/** The open pattern's meter; the steps become a bar of it, or two bars if it had two. */
	setMeter(meter: DrumMeterId) {
		const pattern = this.pattern;
		if (pattern.meter === meter) return;
		const was = drumStepsFor(pattern.meter);
		const twoBars = pattern.steps === was[was.length - 1];
		const choices = drumStepsFor(meter);
		const steps = choices[choices.length - (twoBars ? 1 : 2)]!;
		this.project.patterns[this.current] = resizeDrumPattern(
			{ ...$state.snapshot(pattern), meter },
			steps,
		);
		this.#save();
	}
	/**
	 * A preset beat: in place of the project, or its patterns added to the
	 * project (the tempo, swing, feel and kit stay). The project as it was
	 * is kept for `undoPreset` until the next edit.
	 */
	loadPreset(preset: DrumPreset, mode: "replace" | "add") {
		this.loadProject(drumPresetProject(preset), mode, preset.name);
	}
	/**
	 * A project from elsewhere (a preset, a saved beat) in place of this one
	 * or added to it, with undo. Replacing keeps the name until the first
	 * edit; adding makes a mix of two, which has no name.
	 */
	loadProject(loaded: DrumProject, mode: "replace" | "add", name: string | null = null) {
		const before = $state.snapshot(this.project);
		if (mode === "replace") {
			this.project = loaded;
			this.current = 0;
		} else {
			const room = MAX_DRUM_PATTERNS - this.project.patterns.length;
			if (room <= 0) return;
			const first = this.project.patterns.length;
			this.project.patterns.push(...loaded.patterns.slice(0, room));
			this.current = first;
		}
		this.#afterSwap(before.kit);
		this.beforePreset = before;
		this.loadedName = mode === "replace" ? name : null;
	}
	/**
	 * A generated pattern (generateDrumPattern) in place of the open one, or
	 * added after it, in the open pattern's shape; the project as it was is
	 * kept for `undoPreset` until the next edit. Returns the pattern's index.
	 */
	generate(style: DrumGeneratorStyle, density: number, mode: "replace" | "add"): number {
		const seed = Math.floor(Math.random() * 2 ** 32);
		const pattern = generateDrumPattern(style, density, $state.snapshot(this.pattern), seed);
		return this.placePattern(pattern, mode, { fx: style.fx });
	}
	/**
	 * A pattern from elsewhere (the generator, Text-to-Beat) in place of the
	 * open one or added after it, with a tempo, swing and effects when they
	 * come with it; the project as it was is kept for `undoPreset` until the next
	 * edit. Returns the pattern's index (the open one when there is no room).
	 */
	placePattern(
		pattern: DrumPattern,
		mode: "replace" | "add",
		also: { bpm?: number | null; swing?: number | null; fx?: Partial<DrumFx> | null } = {},
	): number {
		const before = $state.snapshot(this.project);
		if (mode === "replace") {
			this.project.patterns[this.current] = pattern;
		} else {
			if (this.project.patterns.length >= MAX_DRUM_PATTERNS) return this.current;
			this.project.patterns.push(pattern);
			this.select(this.project.patterns.length - 1);
		}
		if (also.bpm)
			this.project.bpm = Math.min(DRUM_BPM_MAX, Math.max(DRUM_BPM_MIN, Math.round(also.bpm)));
		if (also.swing !== null && also.swing !== undefined)
			this.project.swing = Math.min(1, Math.max(0, Math.round(also.swing * 100) / 100));
		// Effects: a replacement starts from the defaults plus what came with the pattern (a generated beat is clean unless it asks otherwise); an added pattern applies only what came with it.
		if (mode === "replace") this.project.fx = { ...DEFAULT_DRUM_FX, ...also.fx };
		else if (also.fx) this.project.fx = { ...this.project.fx, ...also.fx };
		this.#resetSolo();
		this.#save();
		this.#bus?.update($state.snapshot(this.project.fx), this.project.bpm);
		this.beforePreset = before;
		return this.current;
	}
	undoPreset() {
		const before = this.beforePreset;
		if (!before) return;
		const kit = this.project.kit;
		this.project = before;
		this.current = Math.min(this.current, before.patterns.length - 1);
		this.#afterSwap(kit);
	}
	/** After the project changed under a running machine: solo, the playing pattern and the kit follow. */
	#afterSwap(previousKit: DrumKitId) {
		this.#resetSolo();
		this.songMode = this.project.timeline.length > 0;
		this.#nextBar = 0;
		this.queuedBar = null;
		if (this.running) {
			this.queued = null;
			this.playing = Math.min(this.current, this.project.patterns.length - 1);
		}
		this.#save();
		this.#bus?.update($state.snapshot(this.project.fx), this.project.bpm);
		if (this.#ctx && (this.project.kit !== previousKit || !this.kitReady)) void this.#readyKit();
	}
	setKit(kit: DrumKitId) {
		if (kit === this.project.kit) return;
		this.project.kit = kit;
		this.kitReady = false;
		this.#save();
		if (this.#ctx) void this.#readyKit();
	}
	setLevel(row: number, level: number) {
		const r = this.pattern.rows[row];
		if (!r || !Number.isFinite(level)) return;
		r.level = Math.min(1, Math.max(0, Math.round(level * 100) / 100));
		this.#save();
	}
	setPan(row: number, pan: number) {
		const r = this.pattern.rows[row];
		if (!r || !Number.isFinite(pan)) return;
		r.pan = Math.min(1, Math.max(-1, Math.round(pan * 100) / 100));
		this.#save();
	}
	toggleMute(row: number) {
		const r = this.pattern.rows[row];
		if (!r) return;
		r.mute = !r.mute;
		this.#save();
	}
	toggleSolo(row: number) {
		this.solo[row] = !this.solo[row];
	}
	setVoice(row: number, voice: DrumVoiceId) {
		const r = this.pattern.rows[row];
		if (!r) return;
		r.voice = voice;
		this.#save();
	}
	/** A row for the first voice not yet in the pattern (the kit's order), up to the limit. */
	addRow() {
		if (this.pattern.rows.length >= MAX_DRUM_ROWS) return;
		const used = new Set(this.pattern.rows.map((r) => r.voice));
		const voice = DRUM_VOICE_IDS.find((v) => !used.has(v)) ?? DRUM_VOICE_IDS[0]!;
		this.pattern.rows.push({
			voice,
			level: 0.8,
			pan: 0,
			mute: false,
			...DEFAULT_DRUM_SENDS[voice],
			cells: Array.from({ length: this.pattern.steps }, () => 0),
		});
		this.solo.push(false);
		this.#save();
	}
	removeRow(row: number) {
		if (this.pattern.rows.length <= 1) return;
		this.pattern.rows.splice(row, 1);
		this.solo.splice(row, 1);
		this.#save();
	}
	/** Every cell of the open pattern off; rows, levels and settings stay. */
	clear() {
		for (const r of this.pattern.rows) r.cells = r.cells.map(() => 0);
		this.#save();
	}

	// ---- pads and MIDI in ----
	/**
	 * One hit of a voice now, at a velocity 0 to 1: through the open
	 * pattern's row for it (its level, pan and sends) or, with none, a plain
	 * row. While playing with record on, the hit also lands in the grid.
	 */
	async hit(voice: DrumVoiceId, velocity = 1) {
		const { ctx, bus } = await this.#graph();
		if (!this.kitReady) await this.#readyKit();
		const row = this.pattern.rows.find((r) => r.voice === voice) ?? {
			voice,
			level: 0.8,
			pan: 0,
			...DEFAULT_DRUM_SENDS[voice],
		};
		playDrumHit(ctx, drumKit(this.project.kit), bus, row, velocity, ctx.currentTime, this.#play);
		if (this.midiRecord && this.running) this.#record(voice, velocity);
	}
	/** A MIDI note in: General MIDI's drum notes play their voices; any other note plays the pattern's rows in order. */
	hitNote(note: number, velocity = 1) {
		const voice =
			DRUM_MIDI_IN_NOTES[note] ??
			this.pattern.rows[
				((note % this.pattern.rows.length) + this.pattern.rows.length) % this.pattern.rows.length
			]!.voice;
		void this.hit(voice, velocity);
	}
	/** The hit into the playing pattern at the nearest step (ghost, normal or accent by velocity), adding a row for a voice it lacks. */
	#record(voice: DrumVoiceId, velocity: number) {
		const ctx = this.#ctx;
		if (!ctx) return;
		const pattern = this.project.patterns[Math.min(this.playing, this.project.patterns.length - 1)];
		if (!pattern) return;
		const stepSeconds = 60 / this.project.bpm / 4;
		const fromNext = Math.round((this.#nextTime - ctx.currentTime) / stepSeconds);
		const step = (((this.#nextStep - fromNext) % pattern.steps) + pattern.steps) % pattern.steps;
		let index = pattern.rows.findIndex((r) => r.voice === voice);
		if (index < 0) {
			if (pattern.rows.length >= MAX_DRUM_ROWS) return;
			pattern.rows.push({
				voice,
				level: 0.8,
				pan: 0,
				mute: false,
				...DEFAULT_DRUM_SENDS[voice],
				cells: Array.from({ length: pattern.steps }, () => 0),
			});
			if (pattern === this.pattern) this.solo.push(false);
			index = pattern.rows.length - 1;
		}
		pattern.rows[index]!.cells[step] =
			velocity < 0.4 ? 1 : velocity < 0.8 ? DRUM_VELOCITY_NORMAL : DRUM_VELOCITY_MAX;
		this.#save();
	}
	/** Web MIDI (Chrome and Edge): every input's pads play the drums. */
	async connectMidi() {
		if (typeof navigator === "undefined" || !("requestMIDIAccess" in navigator)) {
			this.midiIn = { status: "unsupported", inputs: [] };
			return;
		}
		try {
			const access = await navigator.requestMIDIAccess();
			this.#access = access;
			const listen = () => {
				const names: string[] = [];
				for (const input of access.inputs.values()) {
					names.push(input.name ?? "MIDI input");
					input.onmidimessage = this.#onMidi;
				}
				this.midiIn = { status: "on", inputs: names };
			};
			access.onstatechange = listen;
			listen();
			// The kit ready before the first pad lands.
			this.load();
			drumKit(this.project.kit).warm();
		} catch {
			this.midiIn = { status: "denied", inputs: [] };
		}
	}
	#onMidi = (e: MIDIMessageEvent) => {
		const data = e.data;
		if (!data || data.length < 3) return;
		if ((data[0]! & 0xf0) === 0x90 && data[2]! > 0) {
			this.hitNote(data[1]!, data[2]! / 127);
			this.midiActivity = Date.now();
		}
	};
	disconnectMidi() {
		if (this.#access) for (const input of this.#access.inputs.values()) input.onmidimessage = null;
		this.#access = null;
		this.midiIn = { status: "idle", inputs: [] };
	}

	// ---- out ----
	/** The project as a link to this page. */
	shareUrl(): string {
		return `${window.location.origin}/drum-machine#${encodeDrumProject($state.snapshot(this.project))}`;
	}
	/** The song once through, or the open pattern as one seamless cycle, of stereo WAV. */
	wav(): Promise<Blob> {
		const project = $state.snapshot(this.project);
		return this.playsSong
			? renderDrumSongWav(project, $state.snapshot(this.bars))
			: renderDrumPatternWav(project, $state.snapshot(this.pattern));
	}
	/** The song, or the open pattern, as a Standard MIDI File. */
	midi(): Blob {
		return encodeDrumMidi(
			this.playsSong ? $state.snapshot(this.bars) : $state.snapshot(this.pattern),
			this.project.bpm,
			this.project.swing,
			this.project.swingGrid,
		);
	}
	/** "beat-2-100bpm", or "song-8-bars-100bpm": for the file names. */
	fileStem(): string {
		return this.playsSong
			? `song-${this.project.timeline.length}-bars-${this.project.bpm}bpm`
			: `beat-${this.current + 1}-${this.project.bpm}bpm`;
	}
}

export const drumMachine = new DrumMachineEngine();
