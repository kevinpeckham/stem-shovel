/**
 * The circle of fifths as the chord player draws it (docs/chord-player.md):
 * twelve positions clockwise from C, each a major chord (the outer ring),
 * its relative minor (the inner ring) and its diminished chord (the data,
 * no ring yet), with the key signature. Pitch classes are semitones from
 * C (C = 0). Labels use the proper flats and sharps; `id`s are ASCII.
 */
export type ChordQuality = "major" | "minor" | "diminished";

export interface CirclePosition {
	/** 0 = C at twelve o'clock with the key center on C, clockwise. */
	index: number;
	major: { id: string; label: string; pitch: number };
	minor: { id: string; label: string; pitch: number };
	diminished: { id: string; label: string; pitch: number };
	/** "" for C, "♯♯" for D, "♭♭♭" for E♭. */
	signature: string;
}

const P = (
	index: number,
	major: [string, string, number],
	minor: [string, string, number],
	dim: [string, string, number],
	signature: string,
): CirclePosition => ({
	index,
	major: { id: major[0], label: major[1], pitch: major[2] },
	minor: { id: minor[0], label: minor[1], pitch: minor[2] },
	diminished: { id: dim[0], label: dim[1], pitch: dim[2] },
	signature,
});

export const CIRCLE_OF_FIFTHS: CirclePosition[] = [
	P(0, ["C", "C", 0], ["Am", "Am", 9], ["Bdim", "B°", 11], ""),
	P(1, ["G", "G", 7], ["Em", "Em", 4], ["Fsdim", "F♯°", 6], "♯"),
	P(2, ["D", "D", 2], ["Bm", "Bm", 11], ["Csdim", "C♯°", 1], "♯♯"),
	P(3, ["A", "A", 9], ["Fsm", "F♯m", 6], ["Gsdim", "G♯°", 8], "♯♯♯"),
	P(4, ["E", "E", 4], ["Csm", "C♯m", 1], ["Dsdim", "D♯°", 3], "♯♯♯♯"),
	P(5, ["B", "B", 11], ["Gsm", "G♯m", 8], ["Asdim", "A♯°", 10], "♯♯♯♯♯"),
	P(6, ["Gb", "G♭", 6], ["Ebm", "E♭m", 3], ["Fdim", "F°", 5], "♭♭♭♭♭♭"),
	P(7, ["Db", "D♭", 1], ["Bbm", "B♭m", 10], ["Cdim", "C°", 0], "♭♭♭♭♭"),
	P(8, ["Ab", "A♭", 8], ["Fm", "Fm", 5], ["Gdim", "G°", 7], "♭♭♭♭"),
	P(9, ["Eb", "E♭", 3], ["Cm", "Cm", 0], ["Ddim", "D°", 2], "♭♭♭"),
	P(10, ["Bb", "B♭", 10], ["Gm", "Gm", 7], ["Adim", "A°", 9], "♭♭"),
	P(11, ["F", "F", 5], ["Dm", "Dm", 2], ["Edim", "E°", 4], "♭"),
];

/** The chromatic notes for notes mode, by pitch class; sharps, as a keyboard names them. */
export const CHROMATIC_NOTES = [
	"C",
	"C♯",
	"D",
	"D♯",
	"E",
	"F",
	"F♯",
	"G",
	"G♯",
	"A",
	"A♯",
	"B",
] as const;

/** The key centers a player may put at the top, in circle order (the majors' labels). */
export const KEY_CENTERS = CIRCLE_OF_FIFTHS.map((p) => ({ id: p.major.id, label: p.major.label }));

/**
 * The computer keyboard's twelve positions, clockwise from the top: the
 * number row for the majors (1 to 0, then - and =), the row below for the
 * minors (Q to ]), as the piano maps its keys. Shift adds the seventh.
 */
export const CHORD_KEY_CODES: Record<string, { position: number; quality: "major" | "minor" }> = {
	Digit1: { position: 0, quality: "major" },
	Digit2: { position: 1, quality: "major" },
	Digit3: { position: 2, quality: "major" },
	Digit4: { position: 3, quality: "major" },
	Digit5: { position: 4, quality: "major" },
	Digit6: { position: 5, quality: "major" },
	Digit7: { position: 6, quality: "major" },
	Digit8: { position: 7, quality: "major" },
	Digit9: { position: 8, quality: "major" },
	Digit0: { position: 9, quality: "major" },
	Minus: { position: 10, quality: "major" },
	Equal: { position: 11, quality: "major" },
	KeyQ: { position: 0, quality: "minor" },
	KeyW: { position: 1, quality: "minor" },
	KeyE: { position: 2, quality: "minor" },
	KeyR: { position: 3, quality: "minor" },
	KeyT: { position: 4, quality: "minor" },
	KeyY: { position: 5, quality: "minor" },
	KeyU: { position: 6, quality: "minor" },
	KeyI: { position: 7, quality: "minor" },
	KeyO: { position: 8, quality: "minor" },
	KeyP: { position: 9, quality: "minor" },
	BracketLeft: { position: 10, quality: "minor" },
	BracketRight: { position: 11, quality: "minor" },
};

/** The key labels by position for the circle's key-label toggle: the number row for the majors, the row below for the minors. */
export const CHORD_KEY_LABELS: { major: string; minor: string }[] = [
	{ major: "1", minor: "Q" },
	{ major: "2", minor: "W" },
	{ major: "3", minor: "E" },
	{ major: "4", minor: "R" },
	{ major: "5", minor: "T" },
	{ major: "6", minor: "Y" },
	{ major: "7", minor: "U" },
	{ major: "8", minor: "I" },
	{ major: "9", minor: "O" },
	{ major: "0", minor: "P" },
	{ major: "-", minor: "[" },
	{ major: "=", minor: "]" },
];

export const CHORD_VOICINGS = [
	{ id: "standard", label: "Standard", hint: "the triad in root position" },
	{ id: "spread", label: "Spread", hint: "the root an octave down, the fifth an octave up" },
	{ id: "rich", label: "Rich", hint: "two bass roots below, the root doubled above" },
	{ id: "bass", label: "Bass", hint: "the triad over a bass root two octaves down" },
	{ id: "rootBass", label: "Root bass", hint: "a bass root under the first inversion" },
] as const;
export type ChordVoicing = (typeof CHORD_VOICINGS)[number]["id"];

export const SEVENTH_TYPES = [
	{ id: "dominant", label: "Dominant 7 (C7)" },
	{ id: "major7", label: "Major 7 (Cmaj7)" },
] as const;
export type SeventhType = (typeof SEVENTH_TYPES)[number]["id"];

export const STRUMS = [
	{ id: "off", label: "Off", ms: 0 },
	{ id: "slow", label: "Slow", ms: 45 },
	{ id: "medium", label: "Medium", ms: 25 },
	{ id: "fast", label: "Fast", ms: 12 },
] as const;
export type Strum = (typeof STRUMS)[number]["id"];
