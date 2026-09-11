/** A stem as described by a manifest or (later) a database row. */
export interface StemSource {
	id: string; // nanoid in production; any unique string in the PoC manifest
	label: string; // "Bass DI", "Drums OH"
	url: string; // static path now, Vercel Blob URL later
	// Known before decoding when the row came from the database (recorded at
	// upload). They let the player render the rows and waveforms at once;
	// the decoded values replace them.
	duration?: number;
	channels?: number;
	peaks?: number[];
}

/** Reactive per-stem state exposed by the engine to the UI. */
export interface StemState {
	id: string;
	label: string;
	gain: number; // fader value, 0 .. FADER_MAX
	muted: boolean;
	soloed: boolean;
	duration: number; // seconds, from the decoded buffer
	channels: number; // 1 = mono, 2 = stereo (after any dual-mono collapse)
	collapsed: boolean; // file was stereo with identical channels; kept as mono
	decodedBytes: number; // PCM footprint in RAM (length * channels * 4)
	peaks: number[]; // PEAK_BINS values in 0..1, max-abs per bin
	decoded: boolean; // false while the row shows manifest data only
}

export type EngineStatus = "idle" | "loading" | "ready" | "error";

/** Shape of static/stems/manifest.json for the PoC test page. */
export interface StemManifest {
	title: string;
	stems: StemSource[];
}
