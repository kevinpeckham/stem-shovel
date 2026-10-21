/**
 * A key as written in Dawn or the stem player ("F#m", "A♭ major", "Bb
 * minor", "C") as a MIDI key signature: sharps −7..7 (negative for
 * flats) and whether it is minor, the way a Standard MIDI File and a DAW's
 * key track hold it. The spelling decides between the enharmonic pair
 * (F# major is six sharps, Gb major six flats); a spelling that has no
 * signature (D# major, Db minor) takes its enharmonic twin. Null for a
 * mode a key signature cannot say (dorian and the rest) or for text that
 * is no key.
 */
export function keySignatureOf(key: string): { sharps: number; minor: boolean } | null {
	const m = /^\s*([A-Ga-g])\s*([#♯b♭]?)\s*(.*?)\s*$/.exec(key);
	if (!m) return null;
	const letter = m[1]!.toUpperCase();
	const accidental = m[2] === "#" || m[2] === "♯" ? 1 : m[2] === "b" || m[2] === "♭" ? -1 : 0;
	const mode = m[3]!.toLowerCase();
	let minor: boolean;
	if (mode === "" || mode === "maj" || mode === "major") minor = false;
	else if (mode === "m" || mode === "min" || mode === "minor" || mode === "-") minor = true;
	else return null;
	const pc = (LETTERS[letter]! + accidental + 12) % 12;
	const choices = (minor ? MINOR : MAJOR)[pc]!;
	const sharps = choices.length === 1 ? choices[0]! : accidental < 0 ? choices[1]! : choices[0]!;
	return { sharps, minor };
}

const LETTERS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** By pitch class: the signature, or the sharp spelling's then the flat spelling's where both exist. */
const MAJOR: number[][] = [
	[0], // C
	[7, -5], // C# / Db
	[2], // D
	[-3], // Eb
	[4], // E
	[-1], // F
	[6, -6], // F# / Gb
	[1], // G
	[-4], // Ab
	[3], // A
	[-2], // Bb
	[5, -7], // B / Cb
];
const MINOR: number[][] = [
	[-3], // C
	[4], // C#
	[-1], // D
	[6, -6], // D# / Eb
	[1], // E
	[-4], // F
	[3], // F#
	[-2], // G
	[5, -7], // G# / Ab
	[0], // A
	[7, -5], // A# / Bb
	[2], // B
];
