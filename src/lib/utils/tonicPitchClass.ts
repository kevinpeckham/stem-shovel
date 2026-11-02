const LETTER_PCS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** The pitch class (C = 0) of a note name such as "F#", "Bb" or "E♭", null when it is not one. */
export function tonicPitchClass(tonic: string): number | null {
	const letter = LETTER_PCS[tonic[0]?.toUpperCase() ?? ""];
	if (letter === undefined) return null;
	let pc = letter;
	for (const ch of tonic.slice(1)) {
		if (ch === "#" || ch === "♯") pc += 1;
		else if (ch === "b" || ch === "♭") pc -= 1;
		else return null;
	}
	return (pc + 12) % 12;
}
