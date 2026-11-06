import type { ChordminiRuns } from "./chordminiRuns";

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

/**
 * A chord per bar from the chord model's frames (stem-bench Study 17's
 * registered read): each bar takes the label most of its frames carry, the
 * frames being those from `round(barStart / frameSec)` up to the next bar's,
 * at least one, cut at the last frame. A bar past the last frame has no
 * chord ("N.C."). Consecutive bars with one chord merge into a segment, as
 * `chordsPerBar` does, so the card, the AI draft and the reconciler read
 * either source alike.
 */
export function chordminiBarChords(stored: ChordminiRuns, barStarts: number[]): BarChordSegment[] {
	const { frameSec, frames, runs } = stored;
	const labelAt = Array.from({ length: frames }, () => "N.C.");
	for (const r of runs)
		for (let f = r.start; f < Math.min(r.end, frames); f++) labelAt[f] = r.chord;
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
