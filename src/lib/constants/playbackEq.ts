/**
 * The session player's playback EQ (docs/uploads-and-blob.md, "The playback
 * EQ"): an 80 Hz high-pass for rumble and five bands, each a gain of
 * −12..+12 dB at an adjustable center (Kevin, 2026-10-26: a live show in the
 * open air wants a low-mid and a high-mid as well, and each center moved to
 * where the trouble is). The low and high bands are shelves, the three
 * mids peaks of Q 1. The same corners drive the Web Audio graph
 * (`src/lib/audio/playbackEq.ts`) and the download's ffmpeg filters
 * (`src/lib/utils/eqFilterGraph.ts`).
 */
export const EQ_BANDS = ["low", "lowMid", "mid", "highMid", "high"] as const;
export type EqBand = (typeof EQ_BANDS)[number];

export interface EqBandSpec {
	label: string;
	kind: "lowshelf" | "peaking" | "highshelf";
	/** The center (a peak) or corner (a shelf) in Hz, and the range the control allows. */
	defaultFreq: number;
	minFreq: number;
	maxFreq: number;
}

export const EQ_BAND_SPECS: Readonly<Record<EqBand, EqBandSpec>> = Object.freeze({
	low: { label: "Low", kind: "lowshelf", defaultFreq: 200, minFreq: 60, maxFreq: 500 },
	lowMid: { label: "Low mid", kind: "peaking", defaultFreq: 400, minFreq: 150, maxFreq: 1000 },
	mid: { label: "Mid", kind: "peaking", defaultFreq: 1000, minFreq: 400, maxFreq: 3000 },
	highMid: { label: "High mid", kind: "peaking", defaultFreq: 2500, minFreq: 1000, maxFreq: 6000 },
	high: { label: "High", kind: "highshelf", defaultFreq: 4000, minFreq: 2000, maxFreq: 12000 },
});

export const PLAYBACK_EQ_MIN_DB = -12;
export const PLAYBACK_EQ_MAX_DB = 12;
/** The high-pass corner. */
export const EQ_HIGH_PASS_HZ = 80;
/** The peaking bands' width. */
export const EQ_PEAK_Q = 1;
