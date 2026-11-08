import type { ChartlessGrid } from "#lib/audio/chartlessGrid.js";

/**
 * What "Use as start of bar 1" writes from a chartless placement
 * (SongTempoKeyTab.svelte): the placed bar one as the song's start of bar 1,
 * in seconds, and the placement's bar as a tempo, to two decimals.
 */
export function chartlessGridUse(placement: ChartlessGrid): { startAt: number; bpm: number } {
	const bpm = Math.round(((60 * placement.beatsPerBar) / placement.period) * 100) / 100;
	return { startAt: placement.barStarts[0], bpm };
}
