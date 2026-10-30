/**
 * Seconds in a chart bar: the numerator's beats at the bpm, where a beat is
 * the meter's bottom note, as the song's changes count it everywhere
 * (`audio/measures.ts`: 6/8 at 120 is 120 eighths a minute, three seconds
 * a bar). The bench's `barSeconds` counted a compound meter's dotted beat
 * instead; the chart's defaults come from the song's changes, so the
 * app's rule holds here, or a 6/8 song would render three times too short
 * and fall outside the alignment's warp slopes. A meter without a readable
 * numerator counts four.
 */
export function chartBarSeconds(meter: string, bpm: number): number {
	const top = Number(/^\s*(\d+)\s*\//.exec(meter)?.[1] ?? 4) || 4;
	return (top * 60) / bpm;
}
