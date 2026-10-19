import type { BarGrid } from "#lib/audio/measures.js";

/**
 * The arrangement's tempo map as a BarGrid (audio/measures.ts, the stem
 * player's bars-and-beats machinery; docs/dawn-daw-plan.md D5): the song's
 * tempo and meter from zero, then each change at its second. Bar 1 is at
 * zero. Pure; the engine, the ruler and the snap all read the same grid.
 */
export function studioGrid(a: {
	bpm: number;
	beatsPerBar: number;
	tempoChanges?: { start: number; bpm: number }[];
	meterChanges?: { start: number; beatsPerBar: number }[];
}): BarGrid {
	const tempos = [
		{ start: 0, bpm: a.bpm },
		...(a.tempoChanges ?? []).filter((c) => c.start > 0),
	].sort((x, y) => x.start - y.start);
	const meters = [
		{ start: 0, beatsPerBar: a.beatsPerBar },
		...(a.meterChanges ?? []).filter((c) => c.start > 0),
	].sort((x, y) => x.start - y.start);
	return { tempos, meters, startAt: 0 };
}
