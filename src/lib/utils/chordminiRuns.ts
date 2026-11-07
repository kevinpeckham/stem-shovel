/**
 * What the chord model stores on a song (`song.chords_json`; docs/audio-engine.md,
 * "The chord model"): the model's per-frame chord labels run-length
 * encoded, so a page can vote a chord per bar against any bar grid without
 * running the model again.
 */
export interface ChordminiRun {
	/** The first frame of the run (0-based), inclusive. */
	start: number;
	/** The frame after the run's last, exclusive. */
	end: number;
	/**
	 * barmark's spelling of the label: `harteToBarmark` ("Am7", "F#", "N.C." for N, "?" for X).
	 * Rows stored before 2026-11-07 carry the bench's older map here, so readers re-spell from `label`.
	 */
	chord: string;
	/** The model's own label ("A:min7", "F#", "N"), what readers spell from. */
	label: string;
}

export interface ChordminiRuns {
	/** The contract's version: the model's and the plan's hashes change it. */
	version: string;
	/** Seconds per frame (2048 / 22050). */
	frameSec: number;
	/** Frames in all. */
	frames: number;
	runs: ChordminiRun[];
}
