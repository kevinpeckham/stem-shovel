/**
 * A level meter's state between frames (docs/stem-engine.md, "Meters"):
 * `level` is the peak shown now (it falls at `FALL` per second once the
 * signal drops), `hold` the peak-hold mark (stays `HOLD_MS`, then falls),
 * and `clipped` sticks from the first sample at or over full scale until
 * a reset. `rms` is the loudness this frame (the root mean square of the
 * samples since the last), rising at once and settling over `RMS_TAU`, for
 * the Stage's halos (docs/visual-mixer.md); the bars keep the peak.
 * Linear, 0 to about 1.25 (a hot fader).
 */
export interface MeterState {
	level: number;
	hold: number;
	/** Context time the hold was set, for its hold-then-fall. */
	heldAt: number;
	clipped: boolean;
	rms: number;
}

export const METER_ZERO: MeterState = { level: 0, hold: 0, heldAt: 0, clipped: false, rms: 0 };

/** Peak at or above this is a clip (full scale, with a hair of tolerance for float rounding). */
export const CLIP_AT = 0.999;
/** How long the hold mark stays before it falls, seconds. */
const HOLD_S = 1.5;
/** How fast the level and (after its hold) the mark fall, in linear units a second. */
const FALL = 1.6;
/** The RMS settles toward a lower reading over this many seconds (a rise is taken at once). */
const RMS_TAU = 0.3;

/** The next state from this frame's peak (and RMS, when the source has one), `now` in seconds and `dt` the seconds since the frame before. */
export function nextMeter(
	prev: MeterState,
	peak: number,
	now: number,
	dt: number,
	rmsIn = 0,
): MeterState {
	const level = peak >= prev.level ? peak : Math.max(peak, prev.level - FALL * dt);
	const prevRms = prev.rms ?? 0;
	const rms = rmsIn >= prevRms ? rmsIn : prevRms + (rmsIn - prevRms) * Math.min(1, dt / RMS_TAU);
	let hold = prev.hold;
	let heldAt = prev.heldAt;
	if (peak >= prev.hold) {
		hold = peak;
		heldAt = now;
	} else if (now - prev.heldAt > HOLD_S) hold = Math.max(level, prev.hold - FALL * dt);
	return { level, hold, heldAt, clipped: prev.clipped || peak >= CLIP_AT, rms };
}

/** A linear level as a 0..1 width on a dB scale with the floor at `floorDb` (−48 dB), unity at 1. */
export function meterWidth(level: number, floorDb = -48): number {
	if (level <= 0) return 0;
	const db = 20 * Math.log10(level);
	return Math.max(0, Math.min(1, 1 - db / floorDb));
}
