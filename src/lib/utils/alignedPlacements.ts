import { ALIGNMENT_SAME_PIECE_RATIO } from "#lib/constants/chartAlignment.js";
import type { Alignment } from "#lib/audio/chartAlignment.js";
import type { ChartBar } from "./chartBars.js";

/**
 * What a chart aligned to a recording places in it (stem-bench Study 12):
 * a section at each bar that begins one, a key or tempo change at each bar
 * whose key or tempo differs from the bar before (the first bar's are the
 * song's, not changes). A placement is hedged where the bench found the
 * method weak or the alignment says so: the first and last sections (the
 * chart stops describing the intro and the outro's tail), a bar whose
 * local cost is more than twice the median (the chart stopped matching
 * there), and everything when the chart does not fit this recording
 * better than its tritone control by `ALIGNMENT_SAME_PIECE_RATIO`. A first
 * section aligned within a quarter second of the start starts at 0; no
 * placement is before 0.
 */
export interface AlignedPlacements {
	sections: { name: string; start: number; hedged: boolean }[];
	keyChanges: { at: number; key: string; hedged: boolean }[];
	tempoChanges: { at: number; bpm: number; hedged: boolean }[];
	/** The control's cost over the chart's: high means the chart is this recording. */
	ratio: number;
	samePiece: boolean;
}

/** A first section this close to the start is the start. */
const START_SNAP = 0.25;
/** A perfect fit costs nothing; the ratio stays finite. */
const COST_FLOOR = 1e-6;

function median(values: number[]): number {
	const sorted = values.toSorted((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function sectionsOf(
	bars: ChartBar[],
	at: (i: number) => number,
	hedge: (i: number) => boolean,
): AlignedPlacements["sections"] {
	const marked = bars.flatMap((b, i) => (b.section ? [{ name: b.section, i }] : []));
	return marked.map(({ name, i }, k) => {
		const start = k === 0 && at(i) < START_SNAP ? 0 : at(i);
		return { name, start, hedged: hedge(i) || k === 0 || k === marked.length - 1 };
	});
}

export function alignedPlacements(bars: ChartBar[], alignment: Alignment): AlignedPlacements {
	const ratio = alignment.controlCost / Math.max(alignment.cost, COST_FLOOR);
	const samePiece = ratio >= ALIGNMENT_SAME_PIECE_RATIO;
	const limit = 2 * median(alignment.localCost);
	const at = (i: number) => Math.max(0, alignment.barStarts[i] ?? 0);
	const hedge = (i: number) => !samePiece || (alignment.localCost[i] ?? 0) > limit;
	const changed = bars.flatMap((b, i) => (i > 0 ? [{ b, i, prev: bars[i - 1]! }] : []));
	return {
		sections: sectionsOf(bars, at, hedge),
		keyChanges: changed
			.filter(({ b, prev }) => b.key !== null && b.key !== prev.key)
			.map(({ b, i }) => ({ at: at(i), key: b.key!, hedged: hedge(i) })),
		tempoChanges: changed
			.filter(({ b, prev }) => b.bpm !== prev.bpm)
			.map(({ b, i }) => ({ at: at(i), bpm: b.bpm, hedged: hedge(i) })),
		ratio,
		samePiece,
	};
}
