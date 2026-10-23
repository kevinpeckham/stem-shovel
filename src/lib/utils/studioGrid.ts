import type { BarGrid } from "#lib/audio/measures.js";
import type { TempoCurve } from "#lib/val/StudioSchema.js";

/**
 * The arrangement's tempo map as a BarGrid (audio/measures.ts, the stem
 * player's bars-and-beats machinery; docs/dawn-daw-plan.md D5): the song's
 * tempo and meter from zero, then each change at its second, each meter
 * with the note its beat is (docs/multitrack-recorder.md "Time-signature
 * denominators"). Bar 1 is at zero. Pure; the engine, the ruler and the
 * snap all read the same grid.
 */
export function studioGrid(a: {
	bpm: number;
	beatsPerBar: number;
	beatUnit?: number;
	tempoChanges?: { start: number; bpm: number; ramp?: TempoCurve }[];
	meterChanges?: { start: number; beatsPerBar: number; beatUnit?: number }[];
}): BarGrid {
	const tempos = [
		{ start: 0, bpm: a.bpm },
		...(a.tempoChanges ?? []).filter((c) => c.start > 0),
	].sort((x, y) => x.start - y.start);
	// Every meter names its unit (a quarter when the arrangement is silent), so the grid counts quarter-note tempo.
	const meters = [
		{ start: 0, beatsPerBar: a.beatsPerBar, beatUnit: a.beatUnit ?? 4 },
		...(a.meterChanges ?? [])
			.filter((c) => c.start > 0)
			.map((c) => ({ start: c.start, beatsPerBar: c.beatsPerBar, beatUnit: c.beatUnit ?? 4 })),
	].sort((x, y) => x.start - y.start);
	return { tempos, meters, startAt: 0 };
}
