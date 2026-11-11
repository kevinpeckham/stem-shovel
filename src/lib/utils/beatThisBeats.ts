/**
 * What the beat tracker stores on a song (`song.beats_json`;
 * docs/audio-engine.md, "The tracker's bars"): Beat This's beats and
 * downbeats in the mix, in seconds, so a draft's bar lines are the bars
 * the recording plays. Empty lists mean the tracker ran and read nothing
 * (or failed, said in the job's log): the draft keeps the declared grid.
 */
export interface BeatThisBeats {
	/** The contract's version: the model export's hash changes it. */
	version: string;
	/** Seconds of audio the tracker read. */
	duration: number;
	beats: number[];
	/** A subset of `beats`: the first beat of each bar. */
	downbeats: number[];
}
