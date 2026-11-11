import {
	chartFromDetections,
	type BuildResult,
	type Change,
	type ChordRuns,
	type ConfidenceRecord,
	type TimingMap,
} from "@barmark/sync";
import { barmarkKey } from "#lib/utils/barmarkKey.js";
import { barmarkTempo } from "#lib/utils/barmarkTempo.js";
import type { ChordminiRuns } from "#lib/utils/chordminiRuns.js";
import type { TrackerBarGrid } from "#lib/utils/trackerBarGrid.js";
import type { ChordSegmentInput } from "#lib/val/ChartDraftSchema.js";
import type { SongChange } from "#lib/val/SongChangeSchema.js";

/** What the builder reads of the song: its settings and sections, its mix, and the chord model's runs when they read the current mix. */
export interface ChartBuildSong {
	title: string;
	changes: SongChange[];
	sections: { name: string; start: number }[];
	mixKey: string | null;
	chordsJson: ChordminiRuns | null;
}

/** What the browser sent (`ChartDraftSchema`): the bar grid, the chord per run of bars, and who named them. */
export interface ChartBuildInput {
	grid: number[];
	chords: ChordSegmentInput[];
	source: "matcher" | "model";
	/**
	 * The beat tracker's bars for the current mix, when it read them
	 * (utils/trackerBarGrid.ts): with the chord model's runs they replace the
	 * browser's grid, so the draft's bars are the bars the recording plays.
	 */
	tracker?: TrackerBarGrid | null;
}

export interface ChartBuild {
	/** `printChart` output; "" when the grid is unusable. */
	chart: string;
	timing: TimingMap | null;
	confidence: ConfidenceRecord | null;
	/** The builder's errors and warnings in the draft card's shape; its info notes are left out. */
	diagnostics: { level: "error" | "warning"; message: string }[];
	/** The bar grid the chart was built on: the tracker's when `onTracker`, else the browser's. */
	grid: number[];
	onTracker: boolean;
}

/** The song's first value of a kind at 0:00, or null. */
function at0(changes: SongChange[], kind: SongChange["kind"]): string | null {
	return changes.find((c) => c.kind === kind && c.start === 0)?.value ?? null;
}

/** The meter in force at `t`: the latest meter change at or before it, else the song's at 0:00. */
function meterAt(changes: SongChange[], t: number): string | null {
	let meter: string | null = null;
	let from = -1;
	for (const c of changes) {
		if (c.kind === "meter" && c.start <= t && c.start >= from) {
			meter = c.value;
			from = c.start;
		}
	}
	return meter;
}

/** The song's changes after 0:00 for the builder: tempos in barmark's beat, keys in barmark's spelling. */
function changesOf(changes: SongChange[]): Change[] {
	return changes
		.filter((c) => c.start > 0)
		.map((c) => ({
			kind: c.kind,
			start: c.start,
			value:
				c.kind === "tempo"
					? barmarkTempo(c.value, meterAt(changes, c.start))
					: c.kind === "key"
						? barmarkKey(c.value)
						: c.value,
		}));
}

/**
 * The browser's segments as symbol runs in seconds: each from its first
 * bar's start to the start of the bar after it (the grid's end for the
 * last); a segment past the grid is dropped.
 */
function segmentRuns(grid: number[], chords: ChordSegmentInput[]): ChordRuns {
	const end = grid.at(-1) ?? 0;
	return {
		runs: chords
			.filter((c) => grid[c.bar - 1] !== undefined)
			.map((c) => ({
				start: grid[c.bar - 1],
				end: grid[c.bar - 1 + c.bars] ?? end,
				symbol: c.chord,
			})),
	};
}

/**
 * The starting chart for a draft (docs/audio-engine.md, "The timing map"
 * and "The tracker's bars"): `@barmark/sync`'s `chartFromDetections`.
 *
 * On the beat tracker's bars when it read the mix and the chord model
 * named the chords (stem-bench Study 41): the bar lines are the tracker's
 * downbeats, the meter its label, the tempo the grid's own, and the model's
 * frames are voted onto those bars. The song's tempo and meter changes sit
 * on the declared timeline and are left out; its keys are kept.
 *
 * Otherwise on the browser's bar grid, with the chord model's runs as
 * stored when they named the chords, else the notes matcher's chord per
 * bar, and the song's meter and changes: no tempo is passed, since the grid
 * came from the declared tempo and the builder derives the same in
 * barmark's beat.
 *
 * Never throws; an unusable grid gives chart "" and timing null.
 */
export function buildChartFromDetections(song: ChartBuildSong, input: ChartBuildInput): ChartBuild {
	const key = at0(song.changes, "key");
	const tracker = input.source === "model" && song.chordsJson ? (input.tracker ?? null) : null;
	const grid = tracker ? tracker.bars : input.grid;
	const meter = tracker ? tracker.meter : at0(song.changes, "meter");
	const changes = changesOf(song.changes);
	const result: BuildResult = chartFromDetections({
		title: song.title,
		grid: { bars: grid },
		chords:
			input.source === "model" && song.chordsJson
				? song.chordsJson
				: segmentRuns(input.grid, input.chords),
		key: key === null ? null : barmarkKey(key),
		...(meter === null ? {} : { meter }),
		changes: tracker ? changes.filter((c) => c.kind === "key") : changes,
		sections: song.sections.map((s) => ({ name: s.name, start: s.start })),
		recording: { id: song.mixKey ?? undefined, duration: grid.at(-1) },
	});
	return {
		chart: result.chart,
		timing: result.timing,
		confidence: result.confidence,
		diagnostics: result.diagnostics.flatMap((d) =>
			d.severity === "info" ? [] : [{ level: d.severity, message: d.message }],
		),
		grid,
		onTracker: tracker !== null,
	};
}
