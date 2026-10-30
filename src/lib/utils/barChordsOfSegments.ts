/**
 * The chord in force at each bar 1..`barCount`, from the chord detector's
 * runs (`chordsPerBar`): "" where no run covers the bar. The per-bar list
 * the chord reconciler reads and answers (stem-bench Study 13).
 */
export function barChordsOfSegments(
	segments: { bar: number; bars: number; chord: string }[],
	barCount: number,
): string[] {
	const chords = Array.from({ length: Math.max(0, barCount) }, () => "");
	for (const s of segments) {
		for (let i = 0; i < s.bars; i++) {
			const at = s.bar + i - 1;
			if (at >= 0 && at < chords.length) chords[at] = s.chord;
		}
	}
	return chords;
}
