import {
	EQ_BAND_SPECS,
	EQ_BANDS,
	PLAYBACK_EQ_MAX_DB,
	PLAYBACK_EQ_MIN_DB,
} from "#lib/constants/playbackEq.js";
import {
	DEFAULT_PLAYBACK_EQ,
	type EqBandSettings,
	type PlaybackEqSettings,
} from "#lib/val/PlaybackEqSchema.js";

/** A gain in range on the 0.5 dB grid; 0 for anything that is not a finite number. */
export function eqGain(v: unknown): number {
	if (typeof v !== "number" || !Number.isFinite(v)) return 0;
	return Math.round(Math.min(PLAYBACK_EQ_MAX_DB, Math.max(PLAYBACK_EQ_MIN_DB, v)) * 2) / 2 || 0;
}

/** A frequency within the band's range, in whole Hz; the band's default for anything else. */
export function eqFreq(band: (typeof EQ_BANDS)[number], v: unknown): number {
	const spec = EQ_BAND_SPECS[band];
	if (typeof v !== "number" || !Number.isFinite(v)) return spec.defaultFreq;
	return Math.round(Math.min(spec.maxFreq, Math.max(spec.minFreq, v)));
}

function band(name: (typeof EQ_BANDS)[number], v: unknown): EqBandSettings {
	// The first EQ stored a bare gain per band (2026-10-26); it reads as that gain at the default center.
	if (typeof v === "number") return { gain: eqGain(v), freq: EQ_BAND_SPECS[name].defaultFreq };
	if (!v || typeof v !== "object") return { ...DEFAULT_PLAYBACK_EQ[name] };
	const o = v as Record<string, unknown>;
	return { gain: eqGain(o.gain), freq: eqFreq(name, o.freq) };
}

/**
 * Any value read from storage, a row or a request as well-formed settings:
 * gains clamped to the half-dB grid, centers clamped to their band's
 * range, a missing or malformed band flat at its default center, and
 * anything that is not an object the defaults.
 */
export function normalizePlaybackEq(v: unknown): PlaybackEqSettings {
	if (!v || typeof v !== "object") return structuredClone(DEFAULT_PLAYBACK_EQ);
	const o = v as Record<string, unknown>;
	return {
		highPass: o.highPass === true,
		low: band("low", o.low),
		lowMid: band("lowMid", o.lowMid),
		mid: band("mid", o.mid),
		highMid: band("highMid", o.highMid),
		high: band("high", o.high),
	};
}

/** Whether the settings leave the sound as it is: the high-pass off and every gain 0 (a moved center with no gain is inaudible). */
export function isFlatEq(s: PlaybackEqSettings): boolean {
	return !s.highPass && EQ_BANDS.every((b) => s[b].gain === 0);
}
