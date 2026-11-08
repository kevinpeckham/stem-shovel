import type { SongChange } from "#lib/val/SongChangeSchema.js";
import { barmarkTempo } from "./barmarkTempo.js";

/**
 * The song's declared tempo (its "tempo" change at 0:00) in barmark's beat,
 * for a chart export that has no `tempo:` of its own; a song in no meter
 * counts quarters. Null when the song has no tempo or it does not read.
 */
export function songChartTempo(changes: SongChange[]): number | null {
	const value = changes.find((c) => c.kind === "tempo" && c.start === 0)?.value;
	if (value === undefined) return null;
	const meter = changes.find((c) => c.kind === "meter" && c.start === 0)?.value ?? "4/4";
	const tempo = barmarkTempo(value, meter);
	return typeof tempo === "number" && tempo > 0 ? tempo : null;
}
