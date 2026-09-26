import {
	DRUM_BPM_MAX,
	DRUM_BPM_MIN,
	DRUM_VELOCITY_MAX,
	DRUM_VELOCITY_NORMAL,
	DRUM_VOICE_IDS,
	MAX_DRUM_PATTERNS,
	MAX_DRUM_ROWS,
	type DrumKitId,
	type DrumSteps,
	type DrumVoiceId,
} from "$lib/constants/drumMachine";
import { decodeDrumProject } from "$lib/utils/decodeDrumProject";
import {
	loadDrumMachinePreferences,
	saveDrumMachinePreferences,
} from "$lib/utils/drumMachinePreferences";
import { drumStepTime } from "$lib/utils/drumStepTime";
import { emptyDrumPattern } from "$lib/utils/emptyDrumPattern";
import { encodeDrumMidi } from "$lib/utils/encodeDrumMidi";
import { encodeDrumProject } from "$lib/utils/encodeDrumProject";
import { resizeDrumPattern } from "$lib/utils/resizeDrumPattern";
import { startingDrumProject } from "$lib/utils/startingDrumProject";
import { tapTempo } from "$lib/utils/tapTempo";
import type { DrumPattern, DrumProject } from "$lib/val/DrumPatternSchema";
import { playDrumStep, renderDrumPatternWav, type DrumPlayState } from "./drumRender";
import { drumKit } from "./kits";
import { startLookahead } from "./lookahead";
import { playThroughSilentSwitch } from "./playThroughSilentSwitch";

/**
 * The one drum machine on the page (docs/drum-machine.md): a project of
 * patterns played from the Web Audio clock through the shared lookahead
 * loop, the kit's hits scheduled a tenth of a second ahead and the playing
 * step read back off the clock for the grid. One pattern is open for
 * editing; while playing, choosing another queues it for the end of the
 * cycle. The project is remembered per browser; a share link in the URL's
 * hash overrides it.
 */
class DrumMachineEngine {
	project = $state<DrumProject>(startingDrumProject());
	/** The pattern open in the grid. */
	current = $state(0);
	/** The pattern sounding; -1 between runs. */
	playing = $state(-1);
	/** A pattern chosen while another plays: it starts at the end of the cycle. */
	queued = $state<number | null>(null);
	/** Solo per row of the open pattern: a listening choice, not part of the project. */
	solo = $state<boolean[]>([]);
	running = $state(false);
	/** The step sounding now, 0-based; -1 between runs. */
	step = $state(-1);
	/** The current kit is decoded and ready (the acoustic one takes a moment on the first play). */
	kitReady = $state(false);

	#ctx: AudioContext | null = null;
	#master: GainNode | null = null;
	#stopLoop: (() => void) | null = null;
	#frame: number | null = null;
	#nextTime = 0;
	#nextStep = 0;
	#queuedSteps: { step: number; time: number; pattern: number }[] = [];
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
	load(warm = false) {
		if (this.#loaded || typeof window === "undefined") return;
		this.#loaded = true;
		const remembered = loadDrumMachinePreferences();
		if (remembered) this.project = remembered;
		const hash = window.location.hash.slice(1);
		const shared = hash ? decodeDrumProject(hash) : null;
		if (shared) this.project = shared;
		this.current = 0;
		this.#resetSolo();
		if (warm) drumKit(this.project.kit).warm();
	}
	#save() {
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
		const out = this.#master;
		if (!ctx || !out) return;
		while (this.#nextTime < until) {
			// A queued pattern takes over at the top of the cycle.
			if (this.#nextStep === 0 && this.queued !== null) {
				this.playing = this.queued;
				this.queued = null;
			}
			const index = Math.min(this.playing, this.project.patterns.length - 1);
			const pattern = this.project.patterns[index]!;
			const steps = pattern.steps;
			const s = this.#nextStep % steps;
			const stepSeconds = 60 / this.project.bpm / 4;
			const at =
				this.#nextTime + drumStepTime(s, this.project.bpm, this.project.swing) - s * stepSeconds;
			const solo = index === this.current ? this.solo : [];
			playDrumStep(
				ctx,
				drumKit(this.project.kit),
				out,
				this.project,
				pattern,
				s,
				at,
				this.#play,
				solo,
			);
			this.#queuedSteps.push({ step: s, time: at, pattern: index });
			this.#nextTime += stepSeconds;
			this.#nextStep = (s + 1) % steps;
		}
	};
	/** The grid follows the clock, not the scheduler: the step whose time has come. */
	#follow = () => {
		const ctx = this.#ctx;
		if (!ctx) return;
		let current = this.step;
		while (this.#queuedSteps[0] && this.#queuedSteps[0].time <= ctx.currentTime) {
			current = this.#queuedSteps.shift()!.step;
		}
		if (current !== this.step) this.step = current;
		this.#frame = requestAnimationFrame(this.#follow);
	};

	async start() {
		if (this.running) return;
		this.load();
		playThroughSilentSwitch();
		this.#ctx ??= new AudioContext();
		if (!this.#master) {
			this.#master = this.#ctx.createGain();
			this.#master.gain.value = 0.9;
			this.#master.connect(this.#ctx.destination);
		}
		if (this.#ctx.state !== "running") await this.#ctx.resume().catch(() => {});
		this.running = true;
		this.playing = this.current;
		this.queued = null;
		if (!this.kitReady) await this.#readyKit();
		if (!this.running) return; // stopped while the kit loaded
		this.#nextTime = this.#ctx.currentTime + 0.05;
		this.#nextStep = 0;
		this.#queuedSteps = [];
		this.#stopLoop = startLookahead(this.#ctx, this.#queue);
		this.#frame = requestAnimationFrame(this.#follow);
	}
	stop() {
		this.#stopLoop?.();
		this.#stopLoop = null;
		if (this.#frame !== null) cancelAnimationFrame(this.#frame);
		this.#frame = null;
		this.#queuedSteps = [];
		this.step = -1;
		this.playing = -1;
		this.queued = null;
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
		if (!this.running) return;
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
		this.#resetSolo();
		this.#save();
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
	setHumanize(v: number) {
		if (!Number.isFinite(v)) return;
		this.project.humanize = Math.min(1, Math.max(0, Math.round(v * 100) / 100));
		this.#save();
	}
	setSteps(steps: DrumSteps) {
		this.project.patterns[this.current] = resizeDrumPattern($state.snapshot(this.pattern), steps);
		this.#save();
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

	// ---- out ----
	/** The project as a link to this page. */
	shareUrl(): string {
		return `${window.location.origin}/drum-machine#${encodeDrumProject($state.snapshot(this.project))}`;
	}
	/** The open pattern as one seamless cycle of stereo WAV. */
	wav(): Promise<Blob> {
		return renderDrumPatternWav($state.snapshot(this.project), $state.snapshot(this.pattern));
	}
	/** The open pattern as a Standard MIDI File. */
	midi(): Blob {
		return encodeDrumMidi($state.snapshot(this.pattern), this.project.bpm, this.project.swing);
	}
	/** "beat-2-100bpm": for the file names. */
	fileStem(): string {
		return `beat-${this.current + 1}-${this.project.bpm}bpm`;
	}
}

export const drumMachine = new DrumMachineEngine();
