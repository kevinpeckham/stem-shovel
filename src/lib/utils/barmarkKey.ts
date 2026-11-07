import { conventionalKey, keyFromText, printKey } from "barmark";

/**
 * A key as barmark's `key:` directive spells it, from however a detector,
 * the AI or a person wrote it: "E♭ major" → "Eb", "C♯ minor" → "C#m",
 * "G# major" → "Ab" (the spelling with fewer accidentals), "A mixolydian"
 * stays. Text barmark cannot read as a key ("atonal", "") comes back as
 * written, so nothing a user typed is lost.
 */
export function barmarkKey(text: string): string {
	const key = keyFromText(text);
	return key ? printKey(conventionalKey(key)) : text;
}
