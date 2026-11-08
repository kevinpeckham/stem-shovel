import { errorMessage } from "#lib/utils/errorMessage.js";
import * as Data from "effect/Data";

/**
 * The typed failures of a chord-draft run (`SongChordDraft`): each step's
 * error carries the step's sentence (`step`) and what went wrong (`cause`),
 * so the run reports any of them in one place (`chordDraftErrorMessage`).
 */

/** A step's error class: its `_tag`, its sentence, and `message` as the notification says it. */
const stepError = <Tag extends string>(tag: Tag, step: string) =>
	class extends Data.TaggedError(tag)<{ readonly cause: unknown }> {
		readonly step = step;
		constructor(args: { cause: unknown }) {
			super(args);
			this.message = `${step}: ${errorMessage(args.cause)}`;
		}
	};

/** "Generate chart" without a grid, or before every stem has decoded. */
export class GridError extends stepError("GridError", "Generating the chart failed") {}
/** The notes path's transcription failed. */
export class ChordsError extends stepError("ChordsError", "Chord detection failed") {}
/** The chartless placement failed: never reported, the bars fall back to the declared grid. */
export class PlacementError extends stepError("PlacementError", "Placing the bars failed") {}
/** "Generate chart"'s start-of-bar-1 write failed: said, and the run goes on. */
export class BarOneError extends stepError("BarOneError", "Setting the start of bar 1 failed") {}
/** The AI's draft failed. */
export class DraftError extends stepError("DraftError", "The draft failed") {}
/** "Generate chart"'s save of the chart failed. */
export class SaveError extends stepError("SaveError", "Saving the chart failed") {}

/**
 * A poll of the chord model's state that found no chords yet: whether a run
 * holds the song, and whether a posted job has had its time to claim it.
 */
export class ModelNotReady extends Data.TaggedError("ModelNotReady")<{
	readonly inFlight: boolean;
	readonly claimWindowPassed: boolean;
}> {}

/** A step's error: a tagged error with its sentence. */
const isStepError = (e: unknown): e is { step: string; cause: unknown } =>
	typeof e === "object" &&
	e !== null &&
	"_tag" in e &&
	typeof (e as { step?: unknown }).step === "string";

/** What to show for a run's failure: "<step>: <what went wrong>" for a step's error, else the message. */
export function chordDraftErrorMessage(e: unknown): string {
	return isStepError(e) ? `${e.step}: ${errorMessage(e.cause)}` : errorMessage(e);
}
