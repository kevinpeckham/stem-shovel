import type { Detection } from "#lib/audio/analysis.js";

const COUNTED: [number, string][] = [
	[2, "in eighths"],
	[0.5, "in half notes"],
	[1.5, "in quarters"],
	[2 / 3, "in dotted quarters"],
	[3, "three to the bar"],
];

/** One rung of the tempo ladder in words: "224 counted in eighths", "224 counted three to the bar". */
export function tempoRungText(bpm: number, factor: number): string {
	const value = Math.round(bpm * factor);
	const counted = COUNTED.find(([f]) => Math.abs(f - factor) < 1e-9)?.[1];
	return counted ? `${value} counted ${counted}` : `${value} at ${factor}×`;
}

/** The rungs a musician counts from each kind of beat: a quarter's, then a dotted quarter's. */
const SHOWN: Record<Detection["tempo"]["subdivision"], number[]> = {
	2: [2, 0.5],
	3: [3, 1.5],
};

/**
 * The detection's strongest other rungs, as a tail for the detected tempo:
 * "or 224 counted in eighths, or 60 counted in half notes", or "" when none
 * reaches `min` strength. At most `max`, strongest first. Which rungs read
 * as counts depends on the beat the detector heard. From a quarter
 * (subdivision 2) only double and half: running straight eighths correlate
 * at three eighths too, and "80 counted in dotted quarters" under a 4/4 at
 * 120 would offer an error as a count. From a dotted quarter (subdivision
 * 3) only its eighths, three of them (the waltz counted three to the bar
 * when the beat is its bar), and the hemiola's quarters at 1.5: twice a
 * dotted beat is nothing a musician counts, and the 2/3 that turns a
 * quarter into a dotted quarter turns a dotted quarter into nothing, so
 * the quarter's labels would print "or 149 counted in eighths" over a 6/8
 * at 74.7 whose eighths are at 224 (stem-bench Study 11b).
 */
export function tempoAlternatesText(tempo: Detection["tempo"], min = 0.5, max = 2): string {
	const shown = SHOWN[tempo.subdivision];
	return [...tempo.alternates]
		.filter((r) => r.strength >= min && shown.some((f) => Math.abs(f - r.factor) < 1e-9))
		.sort((a, b) => b.strength - a.strength)
		.slice(0, max)
		.map((r) => `or ${tempoRungText(tempo.bpm, r.factor)}`)
		.join(", ");
}
