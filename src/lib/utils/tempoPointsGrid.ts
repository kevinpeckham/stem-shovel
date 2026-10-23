import type { BarGrid } from "#lib/audio/measures.js";
import { studioGrid } from "./studioGrid";
import type { TempoCurve } from "#lib/val/StudioSchema.js";

/**
 * The grid a DAW will build from the tempo points a writer lays down
 * (utils/tempoPointsOf.ts): each point linear to the next becomes a ramp on
 * the file's `curve`. A writer converts its beats and ticks through this
 * grid rather than the arrangement's own, so what the DAW reads lands
 * where Dawn meant it even where a ramp of the other curve went out bar
 * by bar.
 */
export function tempoPointsGrid(
	points: { start: number; bpm: number; linear: boolean }[],
	curve: TempoCurve,
	meter: { beatsPerBar: number; meterChanges?: { start: number; beatsPerBar: number }[] },
): BarGrid {
	const first = points[0] ?? { start: 0, bpm: 120, linear: false };
	return studioGrid({
		bpm: first.bpm,
		beatsPerBar: meter.beatsPerBar,
		tempoChanges: points.slice(1).map((p, i) => ({
			start: p.start,
			bpm: p.bpm,
			...(points[i]!.linear ? { ramp: curve } : {}),
		})),
		meterChanges: meter.meterChanges,
	});
}
