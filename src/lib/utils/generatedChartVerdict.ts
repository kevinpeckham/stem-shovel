import {
	GENERATED_MAX_GRID_DRIFT,
	GENERATED_MAX_UNKNOWN_SHARE,
	GENERATED_MIN_NOTES_PER_BAR,
} from "#lib/constants/chartVerdict.js";

/** What the verdict reads of the drafted chart: the builder's diagnostics and its timing map. */
export interface VerdictDraft {
	diagnostics?: { level: "error" | "warning" }[];
	/** Null when the draft step dropped the map; absent for a draft that never carries one. */
	timing?: unknown;
	/** The draft was built on the beat tracker's bars, not the song's grid. */
	onTracker?: boolean;
	/** On the tracker's bars: what the draft says when they are not the song's settings' bars (utils/trackerGridNote.ts). */
	gridNote?: string | null;
}

export interface GeneratedChartVerdict {
	/** Saved unattended: no hold. */
	save: boolean;
	/** Why not, each a clause the held notification joins. */
	holds: string[];
	/** Saved anyway, but said. */
	notes: string[];
}

const NO_CHORD = new Set(["?", "N.C."]);

/**
 * The holds that come from the grid the draft stands on. On the song's
 * grid: a tempo this run detected, or bars the comb settled far off the
 * declared tempo. On the tracker's bars: a tempo the member set that the
 * recording's bars are not.
 */
function gridHolds(
	draft: VerdictDraft,
	detectedGrid: boolean,
	gridDrift: number | null,
): (string | false)[] {
	if (draft.onTracker === true)
		return [
			!detectedGrid &&
				!!draft.gridNote &&
				"the recording's bars are not the bars the song's tempo and time signature make",
		];
	return [
		detectedGrid && "its tempo and time signature were detected from the stems and need checking",
		gridDrift !== null &&
			gridDrift > GENERATED_MAX_GRID_DRIFT &&
			`its bars settled ${Math.round(100 * gridDrift)}% off the declared tempo`,
	];
}

/**
 * Whether "Generate chart from the stems" saves its draft unattended
 * (SongChordDraft's `generateChart`): held when the run detected the
 * song's tempo and time signature itself, when the chart carries an
 * error, has lost its timing map, or most of its bars (over
 * `GENERATED_MAX_UNKNOWN_SHARE`) have no chord the model could name; a
 * held draft stays on the draft card for review, and so is one whose
 * bars settled far off the declared tempo (`GENERATED_MAX_GRID_DRIFT`) or
 * whose transcription is too thin (`GENERATED_MIN_NOTES_PER_BAR`). The
 * detected-grid hold is stem-bench Study 34's: all five of its confidently
 * wrong charts were drafted faithfully on a grid whose tempo, meter or key
 * the detector had wrong. The drift and notes holds are Study 34b's: with
 * the true tempo and meter declared the same five stayed wrong, two because
 * the comb drifted on an unevenly cut 78 and three because the
 * transcription found one or two notes a bar, and both signals flagged all
 * five before the model ran while no other hold here saw them. A draft on
 * the beat tracker's bars (stem-bench Study 41) does not stand on the
 * song's grid, so neither grid hold applies to it; it is held instead when
 * its bars are not the bars a tempo the member set makes, so the member
 * reads that on the card before anything is saved (a tempo this run
 * detected itself is not theirs to contradict). Saved with a note when
 * the vote left bar 1 unplaced or the chart carries warnings.
 */
export function generatedChartVerdict({
	draft,
	segments,
	undecided,
	detectedGrid = false,
	gridDrift = null,
	noteCount = null,
}: {
	draft: VerdictDraft;
	/** The chord segments the draft was built from. */
	segments: { chord: string; bars: number }[];
	/** The placement refused with `undecided`. */
	undecided: boolean;
	/** This run set the song's tempo and time signature from the stems itself (the song had none). */
	detectedGrid?: boolean;
	/** How far the placed bars' period settled from the declared bar, as a fraction; null when the bars were not placed. */
	gridDrift?: number | null;
	/** Transcribed notes over the whole song; null when no transcription was at hand. */
	noteCount?: number | null;
}): GeneratedChartVerdict {
	const levels = (draft.diagnostics ?? []).map((d) => d.level);
	const bars = segments.reduce((n, s) => n + s.bars, 0);
	const unknown = segments.reduce((n, s) => n + (NO_CHORD.has(s.chord) ? s.bars : 0), 0);
	const warnings = levels.filter((l) => l === "warning").length;
	const notesPerBar = noteCount === null || bars === 0 ? null : noteCount / bars;
	const holds = [
		...gridHolds(draft, detectedGrid, gridDrift),
		notesPerBar !== null &&
			notesPerBar < GENERATED_MIN_NOTES_PER_BAR &&
			`the stems gave too few notes to hear the chords (${notesPerBar.toFixed(1)} a bar)`,
		levels.includes("error") && "the chart has errors",
		draft.timing === null && "its bar count no longer matches the stems, so it has no timing",
		bars > 0 &&
			unknown / bars > GENERATED_MAX_UNKNOWN_SHARE &&
			"most of its bars have no chord the model could name",
	].filter((h): h is string => typeof h === "string");
	const notes = [
		undecided && "bar 1 was not placed from the stems",
		warnings > 0 && `${warnings} ${warnings === 1 ? "warning" : "warnings"} on the chart`,
	].filter((n): n is string => typeof n === "string");
	return { save: holds.length === 0, holds, notes };
}
