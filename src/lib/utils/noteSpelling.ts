/**
 * A MIDI note spelled for the chord player's readout (docs/chord-player.md,
 * "The readout"): its letter, accidental and octave, in flats or sharps as
 * the chord's side of the circle prefers, and its place on a treble staff
 * as steps up from the bottom line (E4 = 0, each line or space one step).
 */
export interface SpelledNote {
	midi: number;
	/** "E♭", "F♯", "C". */
	name: string;
	letter: string;
	accidental: "" | "♯" | "♭";
	octave: number;
	/** Steps up from the treble staff's bottom line (E4); negative below it. */
	step: number;
}
const SHARPS = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const FLATS = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];
const LETTER_INDEX: Record<string, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };

export function spellNote(midi: number, flats: boolean): SpelledNote {
	const pitch = ((midi % 12) + 12) % 12;
	const octave = Math.floor(midi / 12) - 1;
	const name = (flats ? FLATS : SHARPS)[pitch];
	const letter = name[0];
	const accidental = (name.slice(1) as SpelledNote["accidental"]) || "";
	const step = (octave - 4) * 7 + LETTER_INDEX[letter] - LETTER_INDEX.E;
	return { midi, name, letter, accidental, octave, step };
}

/** The notes of a chord spelled, ascending, each pitch once. */
export function spellChord(notes: number[], flats: boolean): SpelledNote[] {
	return [...new Set(notes)].sort((a, b) => a - b).map((n) => spellNote(n, flats));
}
