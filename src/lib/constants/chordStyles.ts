/**
 * The chord player's styles (docs/chord-player.md, "Styles"): what notes a
 * wedge gets by its place in the key, before the voicing spreads them.
 * Plain is the triads, the 7 pad adding a seventh; the others put the
 * sevenths and extensions on the buttons, so a blues or a jazz tune plays
 * from the wedges as it should sound. A chord is named by its degree in
 * fifths from the key (0 = I, 1 = V, 11 = IV, 2 = II, 3 = VI, 4 = III,
 * 5 = VII, then the chromatic five) and its quality; the minor row's
 * degree is the minor's own root (vi under I).
 */
export const CHORD_STYLES = [
	{ id: "plain", label: "Plain", hint: "triads; the 7 pad adds a seventh" },
	{
		id: "blues",
		label: "Blues",
		hint: "dominant sevenths on every wedge; the 7 pad adds the ninth",
	},
	{
		id: "jazz",
		label: "Jazz",
		hint: "maj7 on I and IV, m7 on the minors, 7 on V and the borrowed chords, m7♭5 on vii",
	},
	{ id: "lush", label: "Lush", hint: "ninths, elevenths and thirteenths, for gospel and neo-soul" },
	{
		id: "folk",
		label: "Folk",
		hint: "add9 on I and IV, sus4 on V, m7 minors; the 7 pad suspends or augments, as a guitar's open shapes",
	},
	{ id: "fifths", label: "Fifths", hint: "power chords on every wedge, root, fifth and octave" },
] as const;
export type ChordStyleId = (typeof CHORD_STYLES)[number]["id"];

/** A chord's recipe in a style: semitones above the root (the triad first), the name's suffix after the root (after the "m" for a minor), and `rootOnly` when the name drops a minor's "m" (a power chord on the minor wedge is A5, not Am5). */
export interface ChordRecipe {
	intervals: number[];
	suffix: string;
	rootOnly?: boolean;
}
export const CHORD_RECIPES = {
	major: { intervals: [0, 4, 7], suffix: "" },
	minor: { intervals: [0, 3, 7], suffix: "" },
	dim: { intervals: [0, 3, 6], suffix: "°" },
	dom7: { intervals: [0, 4, 7, 10], suffix: "7" },
	maj7: { intervals: [0, 4, 7, 11], suffix: "maj7" },
	min7: { intervals: [0, 3, 7, 10], suffix: "7" },
	halfDim: { intervals: [0, 3, 6, 10], suffix: "7♭5" },
	dom9: { intervals: [0, 4, 7, 10, 14], suffix: "9" },
	maj9: { intervals: [0, 4, 7, 11, 14], suffix: "maj9" },
	min9: { intervals: [0, 3, 7, 10, 14], suffix: "9" },
	min11: { intervals: [0, 3, 7, 10, 14, 17], suffix: "11" },
	dom13: { intervals: [0, 4, 7, 10, 14, 21], suffix: "13" },
	maj13: { intervals: [0, 4, 7, 11, 14, 21], suffix: "maj13" },
	min13: { intervals: [0, 3, 7, 10, 14, 21], suffix: "13" },
	add9: { intervals: [0, 4, 7, 14], suffix: "add9" },
	sus2: { intervals: [0, 2, 7], suffix: "sus2", rootOnly: true },
	sus4: { intervals: [0, 5, 7], suffix: "sus4", rootOnly: true },
	dom7sus4: { intervals: [0, 5, 7, 10], suffix: "7sus4", rootOnly: true },
	aug: { intervals: [0, 4, 8], suffix: "+", rootOnly: true },
	minAdd9: { intervals: [0, 3, 7, 14], suffix: "(add9)" },
	power: { intervals: [0, 7, 12], suffix: "5", rootOnly: true },
	powerWide: { intervals: [0, 7, 12, 19], suffix: "5", rootOnly: true },
} as const satisfies Record<string, ChordRecipe>;
export type ChordRecipeId = keyof typeof CHORD_RECIPES;

/** The degrees, as fifths from the key: the diatonic majors and minors a style treats specially. */
export const DEGREE = { I: 0, V: 1, II: 2, VI: 3, III: 4, VII: 5, IV: 11 } as const;
