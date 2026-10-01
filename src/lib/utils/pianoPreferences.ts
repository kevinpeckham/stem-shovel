import { SCALE_MODE_IDS, type PianoKey } from "$lib/constants/scales";
import {
	DEFAULT_PIANO_OCTAVE,
	PIANO_INSTRUMENT_IDS,
	PIANO_OCTAVE_MAX,
	PIANO_OCTAVE_MIN,
	type PianoInstrumentId,
} from "$lib/constants/piano";

/** The piano's choices, remembered per browser: the sound, the octave the keys start at, the levels. */
const KEY = "stemshovel.piano";

export interface PianoDelay {
	time: number;
	feedback: number;
	level: number;
	/** Analog character: a soft clip in the loop, darker repeats and a slow wobble of the time (docs/piano.md, "Effects"). */
	analog: boolean;
}
export const DEFAULT_PIANO_DELAY: PianoDelay = {
	time: 0.35,
	feedback: 0.35,
	level: 0,
	analog: false,
};
export interface PianoChorus {
	/** The sweep's rate in Hz (0.1 to 5). */
	rate: number;
	/** How far the sweep goes, 0 to 1. */
	depth: number;
	/** The wet level, 0 (off) to 1. */
	mix: number;
}
export const DEFAULT_PIANO_CHORUS: PianoChorus = { rate: 0.8, depth: 0.5, mix: 0 };
const PIANO_TREMOLO_SHAPES = ["sine", "square"] as const;
export type PianoTremoloShape = (typeof PIANO_TREMOLO_SHAPES)[number];
export interface PianoTremolo {
	/** The swing's rate in Hz (0.5 to 12). */
	rate: number;
	/** How deep the swing goes, 0 (off) to 1 (down to silence). */
	depth: number;
	shape: PianoTremoloShape;
}
export const DEFAULT_PIANO_TREMOLO: PianoTremolo = { rate: 5, depth: 0, shape: "sine" };
export interface PianoFuzz {
	/** How hard the clipper is driven, 0 (off) to 1. */
	drive: number;
	/** The tone after the clipper, 0 dark to 1 bright. */
	tone: number;
}
export const DEFAULT_PIANO_FUZZ: PianoFuzz = { drive: 0, tone: 0.5 };
export const PIANO_PHASER_MODES = ["phaser", "flanger"] as const;
export type PianoPhaserMode = (typeof PIANO_PHASER_MODES)[number];
export interface PianoPhaser {
	/** One or the other: a phaser (swept all-pass notches) or a flanger (a short swept delay with feedback), sharing the sliders. */
	mode: PianoPhaserMode;
	/** The sweep's rate in Hz (0.1 to 5). */
	rate: number;
	/** How far the notches sweep, 0 to 1. */
	depth: number;
	/** The wet level, 0 (off) to 1. */
	mix: number;
}
export const DEFAULT_PIANO_PHASER: PianoPhaser = { mode: "phaser", rate: 0.5, depth: 0.7, mix: 0 };
const PIANO_WAH_MODES = ["touch", "sweep"] as const;
export type PianoWahMode = (typeof PIANO_WAH_MODES)[number];
export interface PianoWah {
	/** Touch opens the filter with how hard you play; Sweep moves it on its own at `rate`. */
	mode: PianoWahMode;
	/** Touch: how far a note opens it, 0 to 1. */
	sensitivity: number;
	/** Sweep: Hz, 0.1 to 5. */
	rate: number;
	/** How far the filter can travel, 0 to 1. */
	range: number;
	/** The filter's peak, 0 gentle to 1 sharp. */
	resonance: number;
	/** The wet level, 0 (off) to 1. */
	mix: number;
}
export const DEFAULT_PIANO_WAH: PianoWah = {
	mode: "touch",
	sensitivity: 0.5,
	rate: 1,
	range: 0.7,
	resonance: 0.5,
	mix: 0,
};
export interface PianoTone {
	/** -1 dark to 1 bright, 0 flat. */
	tilt: number;
	/** The exciter, 0 (off) to 1. */
	air: number;
	/** The low-end enhancer, 0 (off) to 1. */
	bottom: number;
}
export const DEFAULT_PIANO_TONE: PianoTone = { tilt: 0, air: 0, bottom: 0 };
const PIANO_ROTARY_SPEEDS = ["off", "slow", "fast"] as const;
export type PianoRotarySpeed = (typeof PIANO_ROTARY_SPEEDS)[number];
export interface PianoRotary {
	speed: PianoRotarySpeed;
}
export const DEFAULT_PIANO_ROTARY: PianoRotary = { speed: "off" };

export interface PianoPreferences {
	instrument: PianoInstrumentId;
	octave: number;
	volume: number;
	reverb: number;
	/** The room's size, 0 small to 1 a hall. */
	reverbSize: number;
	/** The delay: its time in seconds, feedback (0 to 0.9), level (0 = off) and analog character. */
	delay: PianoDelay;
	/** The chorus (mix 0 = off), tremolo (depth 0 = off), fuzz (drive 0 = off), phaser (mix 0 = off) and rotary speaker. */
	chorus: PianoChorus;
	tremolo: PianoTremolo;
	fuzz: PianoFuzz;
	wah: PianoWah;
	phaser: PianoPhaser;
	rotary: PianoRotary;
	tone: PianoTone;
	/** The Hi-res samples were chosen once: load them (from the browser's cache after the first time) without asking again. */
	hires: boolean;
	/** The key lit on the keyboard, and whether its keys show their scale degree in place of the letters. */
	key: PianoKey | null;
	degrees: boolean;
	/** The computer-key letters printed on the keys (a small toggle beside the octave); on unless switched off. */
	labels: boolean;
}

export const DEFAULT_PIANO_PREFERENCES: PianoPreferences = {
	instrument: "grand",
	octave: DEFAULT_PIANO_OCTAVE,
	volume: 0.8,
	reverb: 0.25,
	reverbSize: 0.35,
	delay: { ...DEFAULT_PIANO_DELAY },
	chorus: { ...DEFAULT_PIANO_CHORUS },
	tremolo: { ...DEFAULT_PIANO_TREMOLO },
	fuzz: { ...DEFAULT_PIANO_FUZZ },
	wah: { ...DEFAULT_PIANO_WAH },
	phaser: { ...DEFAULT_PIANO_PHASER },
	rotary: { ...DEFAULT_PIANO_ROTARY },
	tone: { ...DEFAULT_PIANO_TONE },
	hires: false,
	key: null,
	degrees: false,
	labels: true,
};

const unit = (v: unknown, fallback: number) =>
	typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;

export function loadPianoPreferences(): PianoPreferences {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return { ...DEFAULT_PIANO_PREFERENCES };
		return parsePianoPreferences(JSON.parse(raw));
	} catch {
		return { ...DEFAULT_PIANO_PREFERENCES };
	}
}

/** Whatever was stored, made safe: unknown sounds and octaves fall back. */
export function parsePianoPreferences(json: unknown): PianoPreferences {
	const p = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
	const instrument = (PIANO_INSTRUMENT_IDS as string[]).includes(String(p.instrument))
		? (p.instrument as PianoInstrumentId)
		: DEFAULT_PIANO_PREFERENCES.instrument;
	const octave =
		typeof p.octave === "number" && Number.isInteger(p.octave)
			? Math.min(PIANO_OCTAVE_MAX, Math.max(PIANO_OCTAVE_MIN, p.octave))
			: DEFAULT_PIANO_OCTAVE;
	return {
		instrument,
		octave,
		volume: unit(p.volume, DEFAULT_PIANO_PREFERENCES.volume),
		reverb: unit(p.reverb, DEFAULT_PIANO_PREFERENCES.reverb),
		reverbSize: unit(p.reverbSize, DEFAULT_PIANO_PREFERENCES.reverbSize),
		delay: parseDelay(p.delay),
		chorus: parseChorus(p.chorus),
		tremolo: parseTremolo(p.tremolo),
		fuzz: parseFuzz(p.fuzz),
		wah: parseWah(p.wah),
		phaser: parsePhaser(p.phaser),
		rotary: parseRotary(p.rotary),
		tone: parseTone(p.tone),
		hires: p.hires === true,
		key: parseKey(p.key),
		degrees: p.degrees === true,
		labels: p.labels !== false,
	};
}

export function savePianoPreferences(p: PianoPreferences): void {
	try {
		localStorage.setItem(KEY, JSON.stringify(p));
	} catch {
		// Private mode or a full store: the choices last for this page only.
	}
}

function parseKey(json: unknown): PianoKey | null {
	if (!json || typeof json !== "object") return null;
	const k = json as Record<string, unknown>;
	const root =
		typeof k.root === "number" && Number.isInteger(k.root) ? ((k.root % 12) + 12) % 12 : null;
	const mode = (SCALE_MODE_IDS as string[]).includes(String(k.mode))
		? (k.mode as PianoKey["mode"])
		: null;
	return root === null || mode === null ? null : { root, mode };
}

const within = (v: unknown, min: number, max: number, fallback: number) =>
	typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;

function parseDelay(json: unknown): PianoDelay {
	const d = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
	return {
		time: within(d.time, 0.05, 1, DEFAULT_PIANO_DELAY.time),
		feedback: Math.min(0.9, unit(d.feedback, DEFAULT_PIANO_DELAY.feedback)),
		level: unit(d.level, DEFAULT_PIANO_DELAY.level),
		analog: d.analog === true,
	};
}

function parseChorus(json: unknown): PianoChorus {
	const c = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
	return {
		rate: within(c.rate, 0.1, 5, DEFAULT_PIANO_CHORUS.rate),
		depth: unit(c.depth, DEFAULT_PIANO_CHORUS.depth),
		mix: unit(c.mix, DEFAULT_PIANO_CHORUS.mix),
	};
}

function parseTremolo(json: unknown): PianoTremolo {
	const t = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
	return {
		rate: within(t.rate, 0.5, 12, DEFAULT_PIANO_TREMOLO.rate),
		depth: unit(t.depth, DEFAULT_PIANO_TREMOLO.depth),
		shape: (PIANO_TREMOLO_SHAPES as readonly string[]).includes(String(t.shape))
			? (t.shape as PianoTremoloShape)
			: DEFAULT_PIANO_TREMOLO.shape,
	};
}

function parseFuzz(json: unknown): PianoFuzz {
	const f = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
	return {
		drive: unit(f.drive, DEFAULT_PIANO_FUZZ.drive),
		tone: unit(f.tone, DEFAULT_PIANO_FUZZ.tone),
	};
}

function parsePhaser(json: unknown): PianoPhaser {
	const p = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
	return {
		mode: p.mode === "flanger" ? "flanger" : "phaser",
		rate: within(p.rate, 0.1, 5, DEFAULT_PIANO_PHASER.rate),
		depth: unit(p.depth, DEFAULT_PIANO_PHASER.depth),
		mix: unit(p.mix, DEFAULT_PIANO_PHASER.mix),
	};
}

function parseRotary(json: unknown): PianoRotary {
	const r = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
	return {
		speed: (PIANO_ROTARY_SPEEDS as readonly string[]).includes(String(r.speed))
			? (r.speed as PianoRotarySpeed)
			: DEFAULT_PIANO_ROTARY.speed,
	};
}

function parseWah(json: unknown): PianoWah {
	const w = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
	return {
		mode: (PIANO_WAH_MODES as readonly string[]).includes(String(w.mode))
			? (w.mode as PianoWahMode)
			: DEFAULT_PIANO_WAH.mode,
		sensitivity: unit(w.sensitivity, DEFAULT_PIANO_WAH.sensitivity),
		rate: within(w.rate, 0.1, 5, DEFAULT_PIANO_WAH.rate),
		range: unit(w.range, DEFAULT_PIANO_WAH.range),
		resonance: unit(w.resonance, DEFAULT_PIANO_WAH.resonance),
		mix: unit(w.mix, DEFAULT_PIANO_WAH.mix),
	};
}

function parseTone(json: unknown): PianoTone {
	const t = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
	return {
		tilt: within(t.tilt, -1, 1, DEFAULT_PIANO_TONE.tilt),
		air: unit(t.air, DEFAULT_PIANO_TONE.air),
		bottom: unit(t.bottom, DEFAULT_PIANO_TONE.bottom),
	};
}
