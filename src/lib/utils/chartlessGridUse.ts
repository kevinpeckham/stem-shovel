import type { PlacedGrid } from "@barmark/listen";

/**
 * What "Use as start of bar 1" writes from a chartless placement
 * (SongTempoKeyTab.svelte): the placed bar one (after any pickup) as the
 * song's start of bar 1, in seconds, and the comb's bar as a tempo in the
 * song's unit (the lattice counts the meter's top number of its bottom
 * note: six eighths in 6/8), to two decimals.
 */
export function chartlessGridUse(placed: PlacedGrid): { startAt: number; bpm: number } {
	const { period, beatsPerBar } = placed.reading.lattice;
	const bpm = Math.round(((60 * beatsPerBar) / period) * 100) / 100;
	return { startAt: placed.grid.bars[0]!, bpm };
}
