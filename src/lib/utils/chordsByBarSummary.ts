/**
 * The detected chords' heading on the song page: "Chords by bar (N bars,
 * X% sure on average)", or, once the AI checked them against the notes,
 * "Chords by bar (N bars, M corrected by the AI from the notes)" ("1 bar corrected" for one).
 */
export function chordsByBarSummary(
	segments: { bars: number; confidence: number }[],
	changed: number | null,
): string {
	const bars = segments.reduce((n, c) => n + c.bars, 0);
	const count = `${bars} ${bars === 1 ? "bar" : "bars"}`;
	if (changed !== null)
		return `Chords by bar (${count}, ${changed === 1 ? "1 bar" : changed} corrected by the AI from the notes)`;
	const sure = segments.reduce((n, c) => n + c.confidence * c.bars, 0) / Math.max(1, bars);
	return `Chords by bar (${count}, ${Math.round(sure * 100)}% sure on average)`;
}
