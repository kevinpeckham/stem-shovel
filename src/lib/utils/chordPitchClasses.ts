import { parseChord } from "barmark";
import { tonicPitchClass } from "./tonicPitchClass.js";

/**
 * Spellings that score reads and older charts produce but barmark's chord
 * grammar rejects, rewritten to the barmark spelling with the same meaning.
 */
const SPELLINGS: [RegExp, string][] = [
	[/−/g, "-"],
	[/Sus/g, "sus"],
	[/mMaj|mM(?=\d)/g, "mmaj"],
	[/^([A-G][#b♯♭]?)(?:Maj|M)/, "$1maj"],
	[/69/g, "6/9"],
	[/\(7\)sus/g, "7sus"],
];

/**
 * The pitch classes a chord symbol names (stem-bench Study 12: the chart
 * rendered as plain pads for chroma alignment): the root (C = 0) and the
 * tones barmark's `parseChord` spells, root first, as absolute pitch
 * classes without repeats, a slash bass among them. The chord means what it
 * means everywhere else in the app (barmark's `C11` has no third, `Am13`
 * carries the eleventh, `C7alt` is root, third and flat seven). Null for
 * N.C. and for anything that is not a chord symbol (a lyric such as
 * "Chorus" or "Bed"), so the chart parsers can tell a chord line from a
 * line of words.
 */
export function chordPitchClasses(symbol: string): { root: number; tones: number[] } | null {
	const token = SPELLINGS.reduce((s, [from, to]) => s.replace(from, to), symbol.trim());
	const read = parseChord(token);
	// A note set (barmark's rootless `kind: "notes"`) has no chord to pad.
	if (!read.ok || read.value.root === null) return null;
	const root = tonicPitchClass(read.value.root);
	if (root === null) return null;
	const tones: number[] = [];
	for (const note of [...read.value.pitches, read.value.bass]) {
		const pc = tonicPitchClass(note);
		if (pc !== null && !tones.includes(pc)) tones.push(pc);
	}
	return { root, tones };
}
