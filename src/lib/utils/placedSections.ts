import type { SectionsAnswer } from "#lib/server/aiDetect.js";
import type { AlignedPlacements } from "./alignedPlacements.js";
import { alignmentReason, type AlignmentReason } from "./alignmentReason.js";
import { sectionsFromPlacements } from "./sectionsFromPlacements.js";

/** The chart aligned to the stems, or why it could not be. */
export type AlignedChart =
	| { placements: AlignedPlacements; warnings: string[] }
	| { reason: AlignmentReason };

/** "Place from chart": the sections to offer, or the sentence saying why there are none. */
export function placedSections(aligned: AlignedChart): SectionsAnswer | string {
	if ("reason" in aligned) return alignmentReason(aligned.reason);
	return (
		sectionsFromPlacements(aligned.placements, aligned.warnings) ?? "The chart marks no sections"
	);
}
