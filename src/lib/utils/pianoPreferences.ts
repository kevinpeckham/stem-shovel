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
}
export const DEFAULT_PIANO_DELAY: PianoDelay = { time: 0.35, feedback: 0.35, level: 0 };

export interface PianoPreferences {
	instrument: PianoInstrumentId;
	octave: number;
	volume: number;
	reverb: number;
	/** The delay: its time in seconds, feedback (0 to 0.9) and level (0 = off). */
	delay: PianoDelay;
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
	delay: { ...DEFAULT_PIANO_DELAY },
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
		delay: parseDelay(p.delay),
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

function parseDelay(json: unknown): PianoDelay {
	const d = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
	const time =
		typeof d.time === "number" && Number.isFinite(d.time)
			? Math.min(1, Math.max(0.05, d.time))
			: DEFAULT_PIANO_DELAY.time;
	return {
		time,
		feedback: Math.min(0.9, unit(d.feedback, DEFAULT_PIANO_DELAY.feedback)),
		level: unit(d.level, DEFAULT_PIANO_DELAY.level),
	};
}
