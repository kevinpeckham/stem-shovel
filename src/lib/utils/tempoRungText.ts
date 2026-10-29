import type { Detection } from "#lib/audio/analysis.js";

const COUNTED: [number, string][] = [
	[2, "eighths"],
	[0.5, "half notes"],
	[1.5, "quarters"],
	[2 / 3, "dotted quarters"],
];

/** One rung of the tempo ladder in words: "224 counted in eighths". */
export function tempoRungText(bpm: number, factor: number): string {
	const value = Math.round(bpm * factor);
	const counted = COUNTED.find(([f]) => Math.abs(f - factor) < 1e-9)?.[1];
	return counted ? `${value} counted in ${counted}` : `${value} at ${factor}×`;
}

/**
 * The detection's strongest other rungs, as a tail for the detected tempo:
 * "or 224 counted in eighths, or 60 counted in half notes", or "" when none
 * reaches `min` strength. At most `max`, strongest first. The 3:2 rungs
 * show only for a compound beat: running straight eighths correlate at
 * three eighths too, and "80 counted in dotted quarters" under a 4/4 at
 * 120 would offer an error as a count.
 */
export function tempoAlternatesText(tempo: Detection["tempo"], min = 0.5, max = 2): string {
	return [...tempo.alternates]
		.filter(
			(r) => r.strength >= min && (tempo.subdivision === 3 || r.factor === 2 || r.factor === 0.5),
		)
		.sort((a, b) => b.strength - a.strength)
		.slice(0, max)
		.map((r) => `or ${tempoRungText(tempo.bpm, r.factor)}`)
		.join(", ");
}
