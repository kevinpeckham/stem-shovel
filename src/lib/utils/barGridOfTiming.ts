import { chartHash, type TimingMap } from "@barmark/sync";
import { barGrid, type BarGrid } from "#lib/audio/measures.js";
import type { SongChange } from "#lib/val/SongChangeSchema.js";
import { writtenBarsOf } from "./writtenBarsOf.js";

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
 * beat onsets are not used. With the chart's text, when the map was built
 * for that very chart (its hash), the grid carries each bar's written
 * number (`BarGrid.written`) for the readouts. Null for an empty map or a
 * span that is not positive.
 */
export function barGridOfTiming(
	map: TimingMap,
	changes: SongChange[],
	chartMarkdown?: string | null,
): BarGrid | null {
	const entries = map.bars;
	if (entries.length < 1) return null;
	const startAt = entries[0]!.start;
	const meters = metersOf(changes);
	// The first meter holds from bar 1: a meter whose start falls after bar 1's (a repaired bar 1
	// a few ms before 0:00, the song's 4/4 at 0:00) would read as a new bar to `barAt`.
	if (meters[0]!.start > startAt) meters[0] = { ...meters[0]!, start: startAt };
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
	const grid: BarGrid = { tempos, meters, startAt };
	const written = writtenOf(map, chartMarkdown);
	if (written) grid.written = written;
	return grid;
}

/** The written number of each map entry, from the chart the map was built for; null for another chart's text or none. */
function writtenOf(map: TimingMap, chartMarkdown: string | null | undefined): number[] | null {
	if (!chartMarkdown || chartHash(chartMarkdown) !== map.chart.hash) return null;
	const written = writtenBarsOf(chartMarkdown);
	return written && map.bars.map((e) => written[e.bar - 1] ?? e.bar);
}

/** The player's grid for a song: its timing map's when it has one and follows it (falling back when the map makes none; the chart's text numbers its bars as written), else the declared tempo's. */
export function songGrid(
	changes: SongChange[],
	startAt: number | null,
	timing: TimingMap | null,
	useTiming: boolean,
	chartMarkdown?: string | null,
): BarGrid | null {
	return useTiming && timing
		? (barGridOfTiming(timing, changes, chartMarkdown) ?? barGrid(changes, startAt))
		: barGrid(changes, startAt);
}
