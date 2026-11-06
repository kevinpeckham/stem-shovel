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
	/** The chart symbol the bench's map gives the model's label ("Am7", "F#", "N.C."). */
	chord: string;
	/** The model's own label ("A:min7", "F#", "N"), kept for a later re-spelling. */
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
