import type { Interval } from "barmark";

/** Semitones above the root of each scale degree, before its alteration (the 9th, 11th and 13th an octave up). */
const DEGREE_SEMITONES: Record<number, number> = {
	1: 0,
	2: 2,
	3: 4,
	4: 5,
	5: 7,
	6: 9,
	7: 11,
	8: 12,
	9: 14,
	10: 16,
	11: 17,
	12: 19,
	13: 21,
};

/** A barmark interval as semitones above the root: `b3` is 3, `#11` is 18, `bb7` is 9. */
export function intervalSemitones({ degree, alter }: Interval): number {
	return (DEGREE_SEMITONES[degree] ?? 0) + alter;
}
