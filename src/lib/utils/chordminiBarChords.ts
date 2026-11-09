import type { ChordRun, ChordRuns } from "@barmark/sync";
import { harteToBarmark } from "barmark";

/** The chord model's frame (2048 / 22050 s): the grid runs given in seconds are voted on. */
const SECONDS_RUN_FRAME = 2048 / 22050;

/** A run of bars with one chord, in the shape the chord detector (`chordsPerBar`) returns. */
export interface BarChordSegment {
	/** 1-based bar the chord starts on. */
	bar: number;
	bars: number;
	/** Seconds. */
	start: number;
	chord: string;
	/** The share of the run's frames that voted for its chord, 0..1. */
	confidence: number;
}

/** The label most of the frames `lo..hi` carry and its share of them; no frames: "N.C." at 0. */
function vote(labelAt: string[], lo: number, hi: number): { chord: string; confidence: number } {
	const counts = new Map<string, number>();
	for (let f = lo; f < hi; f++) counts.set(labelAt[f], (counts.get(labelAt[f]) ?? 0) + 1);
	let chord = "N.C.";
	let votes = 0;
	for (const [label, n] of counts) {
		if (n > votes) {
			chord = label;
			votes = n;
		}
	}
	return { chord, confidence: hi > lo ? votes / (hi - lo) : 0 };
}

/** A run's chord: spelled from its Harte label when it has one, else its barmark symbol; neither, or a label barmark cannot read, is "?". */
const chordOf = (r: ChordRun) =>
	r.label !== undefined ? (harteToBarmark(r.label) ?? "?") : (r.symbol ?? "?");

/**
 * A chord per bar from the chord model's frames (stem-bench Study 17's
 * registered read): each bar takes the chord most of its frames carry, the
 * frames being those from `round(barStart / frameSec)` up to the next bar's,
 * at least one, cut at the last frame. A bar past the last frame has no
 * chord ("N.C."). A label is spelled by barmark's `harteToBarmark` (N is
 * "N.C.", X and anything it cannot read "?"); a run without a label
 * keeps its barmark `symbol`. Consecutive bars with one chord merge into a segment, as
 * `chordsPerBar` does, so the card, the AI draft and the reconciler read
 * either source alike.
 *
 * Reads any `ChordRuns` (@barmark/sync): the stored `ChordminiRuns` (runs
 * in frames, with `frameSec` and the total `frames`) as before; runs in
 * seconds (no `frameSec`) are voted on the chord model's frame; without
 * a total, the frames end at the last run's end.
 */
export function chordminiBarChords(
	stored: ChordRuns & { frames?: number },
	barStarts: number[],
): BarChordSegment[] {
	const { frameSec = SECONDS_RUN_FRAME, runs } = stored;
	const toFrame = (t: number) => (stored.frameSec === undefined ? Math.round(t / frameSec) : t);
	const frames = stored.frames ?? Math.max(0, ...runs.map((r) => toFrame(r.end)));
	const labelAt = Array.from({ length: frames }, () => "N.C.");
	for (const r of runs) {
		// Spelled from the model's label on read, not the stored `chord`, so rows stored under the bench's older map (min6 as m, hdim7 as dim, X as N.C.) read as barmark spells them now.
		const chord = chordOf(r);
		for (let f = toFrame(r.start); f < Math.min(toFrame(r.end), frames); f++) labelAt[f] = chord;
	}
	const out: BarChordSegment[] = [];
	for (let b = 0; b < barStarts.length - 1; b++) {
		const lo = Math.round(barStarts[b] / frameSec);
		const hi = Math.min(frames, Math.max(lo + 1, Math.round(barStarts[b + 1] / frameSec)));
		const { chord, confidence } = vote(labelAt, lo, hi);
		const previous = out[out.length - 1];
		if (previous && previous.chord === chord) {
			previous.confidence =
				(previous.confidence * previous.bars + confidence) / (previous.bars + 1);
			previous.bars += 1;
		} else out.push({ bar: b + 1, bars: 1, start: barStarts[b], chord, confidence });
	}
	return out;
}
