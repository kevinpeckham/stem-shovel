import type { BeatThisBeats } from "./beatThisBeats.js";
import { beatThisGrid } from "./beatThisGrid.js";

/** Fewer bars than this is not a reading of the song: the draft keeps the declared grid. */
const MIN_BARS = 4;
/**
 * The least share of the bars that must hold the usual count of beats for
 * the tracker's reading to stand as the song's bars. Provisional, from the
 * five dev recordings (2026-11-11): the four it read well had 0.78 to 0.96
 * of their bars at the usual count once half bars were joined; the one it
 * did not (a 3/4 at 224 bpm, bars of 2 to 6 beats in no pattern) had 0.30.
 * Below it the draft keeps the declared grid. A bench study sets it.
 */
const MIN_STEADY_SHARE = 0.6;
/** What is left after the last downbeat is a closing bar when it is at least this share of the usual bar; a shorter tail is left off the grid. */
const MIN_CLOSING_SHARE = 0.5;

export interface TrackerBarGrid {
	/** Where each bar starts in the mix, and where the last one ends (`@barmark/sync`'s bar grid). */
	bars: number[];
	/** The meter the recording reads as (stem-bench Study 41: from the modal beats per bar). */
	meter: "4/4" | "3/4" | "6/8";
	/** Seconds in the usual bar: the median downbeat to downbeat. */
	barSeconds: number;
}

const median = (values: number[]) => {
	const sorted = [...values].sort((a, b) => a - b);
	const mid = sorted.length >> 1;
	return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

/**
 * The downbeats with each pair of adjacent half bars joined into one bar:
 * where the usual bar has an even count of beats and two bars in a row
 * each have half of it, the line between them goes. The tracker reads some
 * passages (a sparse intro, a half-time feel) at half the bar it reads the
 * rest of the song at, and a chart draws every bar the same width, so
 * fifteen half bars would stand as fifteen bars of 4/4. A half bar with no
 * partner stays as read.
 */
function joinHalfBars(beats: number[], downbeats: number[], usual: number): number[] {
	if (usual % 2 !== 0) return downbeats;
	const count = (i: number) =>
		beats.filter((b) => b >= downbeats[i]! && b < downbeats[i + 1]!).length;
	const out: number[] = [];
	for (let i = 0; i < downbeats.length; i++) {
		out.push(downbeats[i]!);
		const pair = i + 2 < downbeats.length && count(i) === usual / 2 && count(i + 1) === usual / 2;
		if (pair) i++;
	}
	return out;
}

/** The share of the bars (downbeat to downbeat) that hold `usual` beats. */
function steadyShare(beats: number[], downbeats: number[], usual: number): number {
	let steady = 0;
	for (let i = 0; i + 1 < downbeats.length; i++) {
		const n = beats.filter((b) => b >= downbeats[i]! && b < downbeats[i + 1]!).length;
		if (n === usual) steady++;
	}
	return steady / (downbeats.length - 1);
}

/**
 * The beat tracker's bars as a draft's bar grid (stem-bench Study 41, Ask B):
 * every downbeat a bar line as read, with no refusal, adjacent half bars
 * joined (`joinHalfBars`), plus a closing bar to the audio's end when what
 * is left is at least half a bar. Null when the tracker read too little to
 * call it the song's bars, or its bars do not settle on one count of beats
 * (`MIN_STEADY_SHARE`): the draft keeps the declared grid.
 */
export function trackerBarGrid(read: BeatThisBeats | null): TrackerBarGrid | null {
	if (!read || read.downbeats.length < MIN_BARS + 1) return null;
	const { meter, beatsPerBar } = beatThisGrid(read.beats, read.downbeats);
	if (!meter || !beatsPerBar) return null;
	const starts = joinHalfBars(read.beats, read.downbeats, beatsPerBar);
	if (starts.length < MIN_BARS + 1) return null;
	if (steadyShare(read.beats, starts, beatsPerBar) < MIN_STEADY_SHARE) return null;
	const barSeconds = median(starts.slice(1).map((t, i) => t - starts[i]!));
	const last = starts.at(-1)!;
	const closes = read.duration - last >= MIN_CLOSING_SHARE * barSeconds;
	return { bars: closes ? [...starts, read.duration] : [...starts], meter, barSeconds };
}
