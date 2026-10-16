import { FADER_MAX } from "#lib/constants/fader.js";

/**
 * Where a track's puck sits on the Stage (docs/visual-mixer.md): x is the
 * pan, −1 at the left edge to 1 at the right; y is the heard level in dB,
 * the fader plus the track's own loudness, on the meters' scale (the floor
 * at the bottom, the fader's top at the top). Fractions 0..1 both ways, y
 * upward (0 is the floor), so a layout flips it. The inverse gives the
 * fader back from a point, so a drag writes the gain that puts the puck
 * where the pointer is.
 */
export const STAGE_FLOOR_DB = -48;
export const STAGE_TOP_DB = 20 * Math.log10(FADER_MAX);
const SPAN = STAGE_TOP_DB - STAGE_FLOOR_DB;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** The gain as dB; −Infinity at zero. */
export const gainDb = (gain: number): number => (gain <= 0 ? -Infinity : 20 * Math.log10(gain));

/** What the track sounds like: the fader in dB plus its loudness relative to the loudest track (≤ 0). */
export const heardDb = (gain: number, loudness: number): number => gainDb(gain) + loudness;

export const xOfPan = (pan: number): number => clamp01((pan + 1) / 2);
export const panAtX = (x: number): number => Math.max(-1, Math.min(1, clamp01(x) * 2 - 1));

export function yOfGain(gain: number, loudness: number): number {
	const db = heardDb(gain, loudness);
	return db === -Infinity ? 0 : clamp01((db - STAGE_FLOOR_DB) / SPAN);
}

/** The fader that puts the puck at `y` (0 at the floor is silence); clamped to the fader's range. */
export function gainAtY(y: number, loudness: number): number {
	const f = clamp01(y);
	if (f <= 0) return 0;
	const db = STAGE_FLOOR_DB + f * SPAN - loudness;
	return Math.max(0, Math.min(FADER_MAX, 10 ** (db / 20)));
}

/** The gain nudged by `db` (a key press); from silence, a nudge up starts at the floor. */
export function nudgeGain(gain: number, db: number): number {
	if (gain <= 0) return db > 0 ? 10 ** (STAGE_FLOOR_DB / 20) : 0;
	const next = gain * 10 ** (db / 20);
	if (next < 10 ** (STAGE_FLOOR_DB / 20)) return 0;
	return Math.min(FADER_MAX, next);
}

export const nudgePan = (pan: number, by: number): number =>
	Math.max(-1, Math.min(1, Math.round((pan + by) * 100) / 100));
