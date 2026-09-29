/**
 * The piano's key helper (docs/piano.md, "Key and chords"): the scales a
 * key can be in, as semitones above the root, and the twelve roots.
 */
export const SCALE_MODES = [
	{ id: "major", label: "Major", intervals: [0, 2, 4, 5, 7, 9, 11] },
	{ id: "minor", label: "Minor", intervals: [0, 2, 3, 5, 7, 8, 10] },
	{ id: "harmonic-minor", label: "Harmonic minor", intervals: [0, 2, 3, 5, 7, 8, 11] },
	{ id: "major-pentatonic", label: "Major pentatonic", intervals: [0, 2, 4, 7, 9] },
	{ id: "minor-pentatonic", label: "Minor pentatonic", intervals: [0, 3, 5, 7, 10] },
	{ id: "blues", label: "Blues", intervals: [0, 3, 5, 6, 7, 10] },
	{ id: "dorian", label: "Dorian", intervals: [0, 2, 3, 5, 7, 9, 10] },
	{ id: "mixolydian", label: "Mixolydian", intervals: [0, 2, 4, 5, 7, 9, 10] },
	{ id: "lydian", label: "Lydian", intervals: [0, 2, 4, 6, 7, 9, 11] },
] as const;
export type ScaleModeId = (typeof SCALE_MODES)[number]["id"];
export const SCALE_MODE_IDS = SCALE_MODES.map((m) => m.id) as ScaleModeId[];

/** Pitch-class names, sharps throughout (as the tuner and the keys spell them). */
export const PITCH_CLASS_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

export interface PianoKey {
	/** Pitch class of the root, 0 = C. */
	root: number;
	mode: ScaleModeId;
}
