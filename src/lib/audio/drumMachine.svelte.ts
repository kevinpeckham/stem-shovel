import {
	DRUM_BPM_MAX,
	DRUM_BPM_MIN,
	DRUM_VELOCITY_NORMAL,
	DRUM_VOICE_IDS,
	MAX_DRUM_ROWS,
	type DrumKitId,
	type DrumSteps,
	type DrumVoiceId,
} from "$lib/constants/drumMachine";
import { decodeDrumPattern } from "$lib/utils/decodeDrumPattern";
import {
	loadDrumMachinePreferences,
	saveDrumMachinePreferences,
} from "$lib/utils/drumMachinePreferences";
import { drumStepTime } from "$lib/utils/drumStepTime";
import { encodeDrumPattern } from "$lib/utils/encodeDrumPattern";
import { resizeDrumPattern } from "$lib/utils/resizeDrumPattern";
import { startingDrumPattern } from "$lib/utils/startingDrumPattern";
import { tapTempo } from "$lib/utils/tapTempo";
import type { DrumPattern } from "$lib/val/DrumPatternSchema";
import { drumKit } from "./kits";
import type { DrumHit } from "./kits/types";
import { startLookahead } from "./lookahead";
import { playThroughSilentSwitch } from "./playThroughSilentSwitch";

/**
 * The one drum machine on the page (docs/drum-machine.md): a pattern of
 * rows and steps played from the Web Audio clock through the shared
 * lookahead loop, the kit's hits scheduled a tenth of a second ahead and
 * the playing step read back off the clock for the grid. The pattern is
 * remembered per browser; a share link in the URL's hash overrides it.
 */

/** Gain per velocity: silent, ghost, normal, accent. */
const VELOCITY_GAIN = [0, 0.45, 0.85, 1];

class DrumMachineEngine {
	pattern = $state<DrumPattern>(startingDrumPattern());
	/** Solo per row: a listening choice, not part of the pattern. */
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
	#queued: { step: number; time: number }[] = [];
	#openHat: DrumHit | null = null;
	#taps: number[] = [];
	#loaded = false;

	/** Reads the remembered pattern, then a share link's, once, in the browser. */
	load() {
		if (this.#loaded || typeof window === "undefined") return;
		this.#loaded = true;
		const remembered = loadDrumMachinePreferences();
		if (remembered) this.pattern = remembered;
		const hash = window.location.hash.slice(1);
		const shared = hash ? decodeDrumPattern(hash) : null;
		if (shared) this.pattern = shared;
		this.solo = this.pattern.rows.map(() => false);
		drumKit(this.pattern.kit); // the acoustic kit starts fetching its files
	}
	#save() {
		saveDrumMachinePreferences($state.snapshot(this.pattern));
	}

	async #readyKit() {
		const ctx = this.#ctx;
		if (!ctx) return;
		this.kitReady = false;
		const kit = drumKit(this.pattern.kit);
		await kit.load(ctx);
		if (kit.id === this.pattern.kit) this.kitReady = true;
	}

	#hit(step: number, at: number) {
		const ctx = this.#ctx;
		const out = this.#master;
		if (!ctx || !out) return;
		const kit = drumKit(this.pattern.kit);
		const anySolo = this.solo.some(Boolean);
		this.pattern.rows.forEach((row, i) => {
			const velocity = row.cells[step] ?? 0;
			if (!velocity || row.mute || (anySolo && !this.solo[i])) return;
			const gain = row.level * row.level * (VELOCITY_GAIN[velocity] ?? 1);
			// A closed hat chokes an open one still ringing, as on a real kit.
			if (row.voice === "hat-closed") this.#openHat?.stop(at);
			const hit = kit.play(row.voice, ctx, at, gain, out);
			if (row.voice === "hat-open") this.#openHat = hit;
		});
	}
	#queue = (until: number) => {
		while (this.#nextTime < until) {
			const steps = this.pattern.steps;
			const s = this.#nextStep % steps;
			const stepSeconds = 60 / this.pattern.bpm / 4;
			const at =
				this.#nextTime + drumStepTime(s, this.pattern.bpm, this.pattern.swing) - s * stepSeconds;
			this.#hit(s, at);
			this.#queued.push({ step: s, time: at });
			this.#nextTime += stepSeconds;
			this.#nextStep = (s + 1) % steps;
		}
	};
	/** The grid follows the clock, not the scheduler: the step whose time has come. */
	#follow = () => {
		const ctx = this.#ctx;
		if (!ctx) return;
		let current = this.step;
		while (this.#queued[0] && this.#queued[0].time <= ctx.currentTime) {
			current = this.#queued.shift()!.step;
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
		if (!this.kitReady) await this.#readyKit();
		if (!this.running) return; // stopped while the kit loaded
		this.#nextTime = this.#ctx.currentTime + 0.05;
		this.#nextStep = 0;
		this.#queued = [];
		this.#stopLoop = startLookahead(this.#ctx, this.#queue);
		this.#frame = requestAnimationFrame(this.#follow);
	}
	stop() {
		this.#stopLoop?.();
		this.#stopLoop = null;
		if (this.#frame !== null) cancelAnimationFrame(this.#frame);
		this.#frame = null;
		this.#queued = [];
		this.step = -1;
		this.running = false;
	}
	toggle() {
		if (this.running) this.stop();
		else void this.start();
	}

	// ---- the pattern ----
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
	setBpm(v: number) {
		if (!Number.isFinite(v)) return;
		this.pattern.bpm = Math.min(DRUM_BPM_MAX, Math.max(DRUM_BPM_MIN, Math.round(v)));
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
		this.pattern.swing = Math.min(1, Math.max(0, Math.round(v * 100) / 100));
		this.#save();
	}
	setSteps(steps: DrumSteps) {
		this.pattern = resizeDrumPattern($state.snapshot(this.pattern), steps);
		this.#save();
	}
	setKit(kit: DrumKitId) {
		if (kit === this.pattern.kit) return;
		this.pattern.kit = kit;
		this.kitReady = false;
		this.#save();
		if (this.#ctx) void this.#readyKit();
		else drumKit(kit);
	}
	setLevel(row: number, level: number) {
		const r = this.pattern.rows[row];
		if (!r || !Number.isFinite(level)) return;
		r.level = Math.min(1, Math.max(0, Math.round(level * 100) / 100));
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
	/** Every cell off; rows, levels and settings stay. */
	clear() {
		for (const r of this.pattern.rows) r.cells = r.cells.map(() => 0);
		this.#save();
	}

	/** The pattern as a link to this page. */
	shareUrl(): string {
		return `${window.location.origin}/drum-machine#${encodeDrumPattern($state.snapshot(this.pattern))}`;
	}
}

export const drumMachine = new DrumMachineEngine();
