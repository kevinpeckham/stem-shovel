import type { SectionsAnswer } from "#lib/server/aiDetect.js";
import type { AlignedPlacements } from "./alignedPlacements.js";

/**
 * The chart's sections as placed by aligning it to the recording
 * (stem-bench Study 12), in the shape the Sections tab offers a detected
 * answer in: null when the chart marks no sections. The note says what is
 * approximate: the first and last boundaries always, the other hedged ones
 * by count, a chart that does not fit this recording, and the first thing
 * the chart parser warned about.
 */
export function sectionsFromPlacements(
	p: AlignedPlacements,
	warnings: string[],
): SectionsAnswer | null {
	if (p.sections.length === 0) return null;
	const inner = p.sections.slice(1, -1).filter((s) => s.hedged).length;
	const notes = [
		`Placed by aligning the chart to the recording; the first and last boundaries are approximate${
			inner > 0 ? `, and ${inner} more ${inner === 1 ? "is" : "are"} uncertain` : ""
		}.`,
		p.samePiece ? null : "The chart does not seem to match this recording.",
		warnings[0] ?? null,
	]
		.filter(Boolean)
		.join(" ");
	return { sections: p.sections.map((s) => ({ at: s.start, name: s.name })), notes };
}
