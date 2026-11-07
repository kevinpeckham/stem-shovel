import type { TimingMap } from "@barmark/sync";
import { barGrid, type BarGrid } from "#lib/audio/measures.js";
import type { SongChange } from "#lib/val/SongChangeSchema.js";

/** The song's time signatures as a grid's meters, 4/4 from 0:00 when it has none. */
function metersOf(changes: SongChange[]): BarGrid["meters"] {
	const meters = changes
		.filter((c) => c.kind === "meter")
		.map((c) => ({ start: c.start, beatsPerBar: Number(c.value.split("/")[0]) }))
		.filter((m) => Number.isFinite(m.beatsPerBar) && m.beatsPerBar > 0);
	return meters.length > 0 ? meters : [{ start: 0, beatsPerBar: 4 }];
}

/**
 * The bar grid a chart's timing map makes (docs/audio-engine.md, "The timing
 * map"): bar 1 at the first entry's start and one tempo per entry, the
 * bar's beats over its span (to the next entry's start; for the last, its
 * own `end` or the map's), so every bar line lands on an entry's start. The
 * meters are the song's time signature changes (4/4 without any). Entries
 * count in recording order, a repeat's bars again, as a readout wants; the
 * beat onsets are not used. Null for an empty map or a span that is not
 * positive.
 */
export function barGridOfTiming(map: TimingMap, changes: SongChange[]): BarGrid | null {
	const entries = map.bars;
	if (entries.length < 1) return null;
	const meters = metersOf(changes);
	const tempos: BarGrid["tempos"] = [];
	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i]!;
		// To the next entry's start, so its bar line lands there; a held bar's own `end` matters only for the last.
		const stop = entries[i + 1]?.start ?? entry.end ?? map.end;
		const span = stop - entry.start;
		if (!Number.isFinite(span) || span <= 0) return null;
		const meter = meters.findLast((m) => entry.start >= m.start) ?? meters[0]!;
		tempos.push({ start: entry.start, bpm: (meter.beatsPerBar * 60) / span });
	}
	return { tempos, meters, startAt: entries[0]!.start };
}

/** The player's grid for a song: its timing map's when it has one and follows it (falling back when the map makes none), else the declared tempo's. */
export function songGrid(
	changes: SongChange[],
	startAt: number | null,
	timing: TimingMap | null,
	useTiming: boolean,
): BarGrid | null {
	return useTiming && timing
		? (barGridOfTiming(timing, changes) ?? barGrid(changes, startAt))
		: barGrid(changes, startAt);
}
