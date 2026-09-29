import { PITCH_CLASS_NAMES, SCALE_MODES, type PianoKey } from "$lib/constants/scales";

/**
 * What a handful of held notes is (docs/piano.md, "Key and chords"): a
 * note, an interval, or a chord named from its pitch classes, with the
 * bass as a slash when it is not the root (C/E), and, in a key, the Roman
 * numeral of the chord's root in that key (V, ii, vii°). The chord table
 * is matched on the set of intervals above a candidate root, every held
 * note tried as the root, the bass preferred; a table entry can leave the
 * fifth out, as players do.
 */
export interface ChordReading {
	/** "C", "Am7", "C/E", "a fifth". */
	name: string;
	/** Pitch class of the root, when a chord was found. */
	root: number | null;
	/** "Am7" → "m7"; "" for a plain major triad. */
	quality: string;
	/** In a key: "V", "ii", "vii°", "IV7"; null off the scale or without a key. */
	numeral: string | null;
}

/** Interval sets above the root, most specific first; `minor` and `dim` set the numeral's case. */
const CHORDS: { suffix: string; set: number[]; minor?: boolean; dim?: boolean }[] = [
	{ suffix: "6/9", set: [0, 2, 4, 7, 9] },
	{ suffix: "maj9", set: [0, 2, 4, 7, 11] },
	{ suffix: "9", set: [0, 2, 4, 7, 10] },
	{ suffix: "m9", set: [0, 2, 3, 7, 10], minor: true },
	{ suffix: "maj7", set: [0, 4, 7, 11] },
	{ suffix: "7", set: [0, 4, 7, 10] },
	{ suffix: "m7", set: [0, 3, 7, 10], minor: true },
	{ suffix: "mMaj7", set: [0, 3, 7, 11], minor: true },
	{ suffix: "dim7", set: [0, 3, 6, 9], dim: true },
	{ suffix: "m7♭5", set: [0, 3, 6, 10], dim: true },
	{ suffix: "7sus4", set: [0, 5, 7, 10] },
	{ suffix: "6", set: [0, 4, 7, 9] },
	{ suffix: "m6", set: [0, 3, 7, 9], minor: true },
	{ suffix: "add9", set: [0, 2, 4, 7] },
	{ suffix: "madd9", set: [0, 2, 3, 7], minor: true },
	{ suffix: "maj7", set: [0, 4, 11] },
	{ suffix: "7", set: [0, 4, 10] },
	{ suffix: "m7", set: [0, 3, 10], minor: true },
	{ suffix: "", set: [0, 4, 7] },
	{ suffix: "m", set: [0, 3, 7], minor: true },
	{ suffix: "dim", set: [0, 3, 6], dim: true },
	{ suffix: "aug", set: [0, 4, 8] },
	{ suffix: "sus2", set: [0, 2, 7] },
	{ suffix: "sus4", set: [0, 5, 7] },
	{ suffix: "5", set: [0, 7] },
];

const INTERVALS = [
	"a unison",
	"a minor second",
	"a major second",
	"a minor third",
	"a major third",
	"a fourth",
	"a tritone",
	"a fifth",
	"a minor sixth",
	"a major sixth",
	"a minor seventh",
	"a major seventh",
	"an octave",
];

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];

export function nameChord(
	midis: readonly number[],
	key: PianoKey | null = null,
): ChordReading | null {
	const notes = [...new Set(midis)].sort((a, b) => a - b);
	if (notes.length === 0) return null;
	const pcs = [...new Set(notes.map((n) => ((n % 12) + 12) % 12))];
	const bass = ((notes[0]! % 12) + 12) % 12;
	if (notes.length === 1)
		return { name: PITCH_CLASS_NAMES[bass]!, root: bass, quality: "", numeral: null };
	if (pcs.length === 1)
		return { name: `${PITCH_CLASS_NAMES[bass]} octaves`, root: bass, quality: "", numeral: null };
	if (notes.length === 2) {
		const semis = notes[1]! - notes[0]!;
		const name = INTERVALS[Math.min(12, semis)] ?? INTERVALS[semis % 12]!;
		return { name, root: null, quality: "", numeral: null };
	}
	// Every held note as a candidate root, the bass first: the first table entry whose set matches wins.
	const candidates = [bass, ...pcs.filter((p) => p !== bass)];
	for (const root of candidates) {
		const rel = new Set(pcs.map((p) => (p - root + 12) % 12));
		for (const chord of CHORDS) {
			if (rel.size !== chord.set.length || !chord.set.every((i) => rel.has(i))) continue;
			const slash = root === bass ? "" : `/${PITCH_CLASS_NAMES[bass]}`;
			return {
				name: `${PITCH_CLASS_NAMES[root]}${chord.suffix}${slash}`,
				root,
				quality: chord.suffix,
				numeral: key ? numeralFor(root, chord, key) : null,
			};
		}
	}
	return {
		name: pcs.map((p) => PITCH_CLASS_NAMES[p]).join(" "),
		root: null,
		quality: "",
		numeral: null,
	};
}

function numeralFor(
	root: number,
	chord: { suffix: string; minor?: boolean; dim?: boolean },
	key: PianoKey,
): string | null {
	const mode = SCALE_MODES.find((m) => m.id === key.mode) ?? SCALE_MODES[0];
	const degree = (mode.intervals as readonly number[]).indexOf((root - key.root + 12) % 12);
	if (degree < 0 || degree > 6) return null;
	const base = ROMAN[degree]!;
	const numeral = chord.minor || chord.dim ? base.toLowerCase() : base;
	const mark = chord.dim ? "°" : chord.suffix === "aug" ? "+" : "";
	const extension = /7|9|6/.test(chord.suffix)
		? chord.suffix
				.replace(/^m(?!aj)/, "")
				.replace("dim", "")
				.replace("♭5", "")
		: "";
	return `${numeral}${mark}${extension}`;
}
