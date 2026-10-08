import { SCALE_MODES, type PianoKey } from "#lib/constants/scales.js";

/**
 * The chord a single key stands for (docs/piano.md, "Arpeggiator"): the
 * triad on that degree of the key lit on the piano, thirds stacked up the
 * scale (so the ii in C major is D minor, the vii diminished); with no key
 * lit the white keys are C major's (Kevin: every key came up major), and a
 * note outside the scale gets a major triad. The root stays where it was
 * played.
 */
export function chordFromKey(midi: number, key: PianoKey | null): number[] {
	const inKey = key ?? { root: 0, mode: "major" as const };
	{
		const mode = SCALE_MODES.find((m) => m.id === inKey.mode) ?? SCALE_MODES[0];
		const intervals = mode.intervals as readonly number[];
		const degree = intervals.indexOf((((midi - inKey.root) % 12) + 12) % 12);
		if (degree >= 0 && intervals.length >= 5) {
			const up = (steps: number) => {
				const i = (degree + steps) % intervals.length;
				const wraps = Math.floor((degree + steps) / intervals.length);
				return midi + (intervals[i]! - intervals[degree]!) + 12 * wraps;
			};
			return [midi, up(2), up(4)];
		}
	}
	return [midi, midi + 4, midi + 7];
}
