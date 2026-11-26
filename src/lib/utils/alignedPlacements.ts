import type { Alignment } from "@barmark/listen";
import type { ChartBar } from "./barmarkChartBars.js";
import { chartBarSeconds } from "./chartBarSeconds.js";

/**
 * What a chart aligned to a recording places in it (stem-bench Study 12),
 * read off the app's own bars of the chart (`barmarkChartBars`: a section
 * named by its heading, rehearsal mark or words, the key, the tempo in the
 * song's unit, the bottom note's) at @barmark/listen's aligned bar starts:
 * a section at each bar that begins one, a key or tempo change at each bar
 * whose key or tempo differs from the bar before (the first bar's are the
 * song's, not changes). listen places from its own reading of the chart,
 * which names sections only by heading or mark and counts tempo in
 * barmark's beat (4/4 at 120 to 6/8 at the same pulse is no change there,
 * 120 to 360 eighths here), so it is not the source.
 *
 * A placement is hedged where the bench found the method weak or the
 * alignment says so: the first and last sections, a bar whose local cost
 * is more than twice the median, and everything when the chart is not
 * this recording (listen's same-piece gate, stem-bench Studies 14 and 16).
 * When it is, a first section at the chart's first bar starts at the
 * first audible sound (FIRST-ONSET) and, with two sections or more, the
 * last starts the chart's own length of it before the last audible sound,
 * never within a bar of the section before (LAST-SOUND; Study 14). When it
 * is not, a first section within a quarter second of the start starts at
 * 0. No placement is before 0.
 */
export interface AlignedPlacements {
	sections: { name: string; start: number; hedged: boolean }[];
	keyChanges: { at: number; key: string; hedged: boolean }[];
	/** `bpm` in the song's unit, the bottom note's (`ChartBar.tempo ?? bpm`). */
	tempoChanges: { at: number; bpm: number; hedged: boolean }[];
	/** The control's cost over the chart's: high means the chart is this recording. */
	ratio: number;
	samePiece: boolean;
}

/** A first section this close to the start is the start. */
const START_SNAP = 0.25;
/** A bar's local cost over this many times the median hedges what is placed there. */
const HEDGE_LOCAL_COST = 2;

/** The chart's own seconds for bars `from` to the end, each at its own tempo and meter. */
const secondsFrom = (bars: ChartBar[], from: number) =>
	bars.slice(from).reduce((sum, b) => sum + chartBarSeconds(b.meter, b.bpm), 0);

/** The song's tempo at a bar, in its unit: a one-bar meter's own bottom note does not count. */
const songTempo = (b: ChartBar) => b.tempo ?? b.bpm;

function sectionsOf(
	bars: ChartBar[],
	alignment: Alignment,
	at: (i: number) => number,
	hedge: (i: number) => boolean,
): AlignedPlacements["sections"] {
	const marked = bars.flatMap((b, i) => (b.section ? [{ name: b.section, i }] : []));
	const starts = marked.map(({ i }) => at(i));
	if (!alignment.samePiece) {
		if (starts.length > 0 && starts[0]! < START_SNAP) starts[0] = 0;
	} else {
		if (marked[0]?.i === 0) starts[0] = Math.max(0, alignment.firstSound);
		if (marked.length >= 2) {
			const [prev, last] = [marked.at(-2)!, marked.at(-1)!];
			const prevBar = bars[prev.i]!;
			const floor = starts.at(-2)! + chartBarSeconds(prevBar.meter, prevBar.bpm);
			starts[starts.length - 1] = Math.max(floor, alignment.lastSound - secondsFrom(bars, last.i));
		}
	}
	return marked.map(({ name, i }, k) => ({
		name,
		start: starts[k]!,
		hedged: hedge(i) || k === 0 || k === marked.length - 1,
	}));
}

/** The placements of `bars` (the chart as the app reads it, the bars listen aligned) at `alignment`'s bar starts. */
export function alignedPlacements(alignment: Alignment, bars: ChartBar[]): AlignedPlacements {
	const limit = HEDGE_LOCAL_COST * alignment.localMedian;
	const at = (i: number) => Math.max(0, alignment.barStarts[i] ?? 0);
	const hedge = (i: number) => !alignment.samePiece || (alignment.localCost[i] ?? 0) > limit;
	const changed = bars.flatMap((b, i) => (i > 0 ? [{ b, i, prev: bars[i - 1]! }] : []));
	return {
		sections: sectionsOf(bars, alignment, at, hedge),
		keyChanges: changed
			.filter(({ b, prev }) => b.key !== null && b.key !== prev.key)
			.map(({ b, i }) => ({ at: at(i), key: b.key!, hedged: hedge(i) })),
		tempoChanges: changed
			.filter(({ b, prev }) => songTempo(b) !== songTempo(prev))
			.map(({ b, i }) => ({ at: at(i), bpm: songTempo(b), hedged: hedge(i) })),
		ratio: alignment.ratio,
		samePiece: alignment.samePiece,
	};
}
