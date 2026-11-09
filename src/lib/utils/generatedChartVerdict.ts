import { GENERATED_MAX_UNKNOWN_SHARE } from "#lib/constants/chartVerdict.js";

/** What the verdict reads of the drafted chart: the builder's diagnostics and its timing map. */
export interface VerdictDraft {
	diagnostics?: { level: "error" | "warning" }[];
	/** Null when the draft step dropped the map; absent for a draft that never carries one. */
	timing?: unknown;
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
 * Whether "Generate chart from the stems" saves its draft unattended
 * (SongChordDraft's `generateChart`): held when the chart carries an
 * error, has lost its timing map, or most of its bars (over
 * `GENERATED_MAX_UNKNOWN_SHARE`) have no chord the model could name; a
 * held draft stays on the draft card for review. Saved with a note when
 * the vote left bar 1 unplaced or the chart carries warnings.
 */
export function generatedChartVerdict({
	draft,
	segments,
	undecided,
}: {
	draft: VerdictDraft;
	/** The chord segments the draft was built from. */
	segments: { chord: string; bars: number }[];
	/** The placement refused with `undecided`. */
	undecided: boolean;
}): GeneratedChartVerdict {
	const levels = (draft.diagnostics ?? []).map((d) => d.level);
	const bars = segments.reduce((n, s) => n + s.bars, 0);
	const unknown = segments.reduce((n, s) => n + (NO_CHORD.has(s.chord) ? s.bars : 0), 0);
	const warnings = levels.filter((l) => l === "warning").length;
	const holds = [
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
