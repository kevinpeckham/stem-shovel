import type { AiAnswer } from "#lib/server/aiDetect.js";
import type { AlignedPlacements } from "./alignedPlacements.js";

/** The song-check's answer, marked when its key and tempo changes were placed by aligning the chart. */
export type PlacedAnswer = AiAnswer & { placedByAlignment?: boolean };

/**
 * The song-check's answer with its key and tempo changes placed by
 * aligning the chart to the recording (stem-bench Study 12) instead of
 * where the model put them: only the changes the chart marks. Marked with
 * `placedByAlignment` rather than a warning, since a warning holds the
 * answer back as a doubtful read. A chart that does not fit this
 * recording places nothing: the model's placement stays, with a warning
 * saying why.
 */
export function placeAnswerByAlignment(answer: AiAnswer, p: AlignedPlacements): PlacedAnswer {
	if (!p.samePiece)
		return {
			...answer,
			warnings: [
				...(answer.warnings ?? []),
				`The chart does not seem to match this recording (alignment cost ratio ${p.ratio.toFixed(1)}), so the changes keep the model's placement.`,
			],
		};
	return {
		...answer,
		keyChanges: p.keyChanges.map(({ at, key }) => ({ at, key })),
		tempoChanges: p.tempoChanges.map(({ at, bpm }) => ({ at, bpm })),
		placedByAlignment: true,
	};
}
