/**
 * Whether a chart's word names a section (Intro, Verse 2, Pre-chorus,
 * Chorus, Bridge, Solo, Interlude, Breakdown, Outro, Coda), as a chart's
 * own text says it; the text trimmed of edge punctuation when it does,
 * null for other words ("rit.", "To Coda", "Fine").
 */
const SECTION =
	/^(?:intro|verse|pre-?\s?chorus|chorus|bridge|solo|interlude|breakdown|outro|coda)\b(?:\s*\d+)?(?:\s*\([^)]*\))?$/i;

export function chartSectionName(word: string): string | null {
	const text = word
		.trim()
		.replace(/^[[("']+|[\])"':.]+$/g, "")
		.trim();
	return SECTION.test(text) ? text : null;
}
