import {
	CHORD_RECIPES,
	DEGREE,
	type ChordRecipe,
	type ChordRecipeId,
	type ChordStyleId,
} from "$lib/constants/chordStyles";
import type { ChordQuality, SeventhType } from "$lib/constants/circleOfFifths";

/**
 * What a wedge plays in a style (docs/chord-player.md, "Styles"): the
 * recipe for a chord of `quality` on the degree `fifths` from the key
 * (0 = I, 1 = V, 11 = IV…), and the recipe the 7 pad raises it to. Plain
 * is the triads and the pad's seventh (the Chords menu's dominant or major
 * seventh on a major chord, the minor seventh on a minor). The others put
 * the sevenths on the buttons and the pad adds the extension above.
 */
export function styledChord(
	style: ChordStyleId,
	fifths: number,
	quality: ChordQuality,
	held: boolean,
	seventhType: SeventhType,
): ChordRecipe {
	const [plain, raised] = recipes(style, fifths, quality, seventhType);
	return CHORD_RECIPES[held ? raised : plain];
}

function recipes(
	style: ChordStyleId,
	fifths: number,
	quality: ChordQuality,
	seventhType: SeventhType,
): [ChordRecipeId, ChordRecipeId] {
	if (quality === "diminished") return ["dim", "halfDim"];
	const minor = quality === "minor";
	switch (style) {
		case "blues":
			return minor ? ["min7", "min9"] : ["dom7", "dom9"];
		case "jazz": {
			if (minor) return fifths === DEGREE.VII ? ["halfDim", "halfDim"] : ["min7", "min9"];
			if (fifths === DEGREE.I || fifths === DEGREE.IV) return ["maj7", "maj9"];
			if (fifths === DEGREE.V) return ["dom7", "dom13"];
			return ["dom7", "dom9"];
		}
		case "folk": {
			// A guitar's open shapes: add9 on I and IV, a sus4 on V, the minors as m7; the pad suspends, or augments I on its way to vi.
			if (minor) return ["min7", "minAdd9"];
			if (fifths === DEGREE.I) return ["add9", "aug"];
			if (fifths === DEGREE.IV) return ["add9", "sus2"];
			if (fifths === DEGREE.V) return ["sus4", "dom7sus4"];
			return ["major", "sus4"];
		}
		case "fifths":
			return ["power", "powerWide"];
		case "honkytonk": {
			// Country's sweetness: sixths on the tonic and subdominant, sevenths on V and the secondary dominants, the pad adding the ninth or a 6/9.
			if (minor) return ["min7", "min9"];
			if (fifths === DEGREE.I || fifths === DEGREE.IV) return ["six", "sixNine"];
			return ["dom7", "dom9"];
		}
		case "ragtime": {
			// Stride's chains of dominants (VI7 II7 V7 I); I and IV plain with a 6 under the pad; a diminished seventh on any minor wedge's root under the pad.
			if (minor) return ["min7", "dim7"];
			if (fifths === DEGREE.I || fifths === DEGREE.IV) return ["major", "six"];
			return ["dom7", "dom9"];
		}
		case "minor": {
			// Home is the relative minor (vi's wedge): i, iv and v plain minors with sevenths under the pad; ii° half-diminished;
			// the harmonic minor's V is the major on III's root (E in A minor), a dominant seventh outright; VI and VII plain.
			if (minor) {
				if (fifths === DEGREE.VII) return ["halfDim", "dim7"];
				return ["minor", "min7"];
			}
			if (fifths === DEGREE.III) return ["dom7", "dom7flat9"];
			if (fifths === DEGREE.V) return ["major", "dom7"];
			return ["major", "maj7"];
		}
		case "bossa": {
			// The jazz palette tilted softer: maj7 with a 6/9 under the pad, a 9 on V with a 7♭9 under it, m7 and m9 on the minors, 7 on the borrowed chords.
			if (minor) return fifths === DEGREE.VII ? ["halfDim", "halfDim"] : ["min7", "min9"];
			if (fifths === DEGREE.I || fifths === DEGREE.IV) return ["maj7", "sixNine"];
			if (fifths === DEGREE.V) return ["dom9", "dom7flat9"];
			return ["dom7", "dom7flat9"];
		}
		case "lush": {
			if (minor) {
				if (fifths === DEGREE.VII) return ["halfDim", "halfDim"];
				if (fifths === DEGREE.III) return ["min11", "min13"];
				return ["min9", "min11"];
			}
			if (fifths === DEGREE.I || fifths === DEGREE.IV) return ["maj9", "maj13"];
			if (fifths === DEGREE.V) return ["dom13", "dom13"];
			return ["dom9", "dom13"];
		}
		default:
			if (minor) return ["minor", "min7"];
			return ["major", seventhType === "major7" ? "maj7" : "dom7"];
	}
}

/** The chord's name from the wedge's label (a minor's carries its "m": "Am") and the recipe: "C", "Cmaj7", "Am7", "Bm7♭5", "G13"; a root-only recipe drops the "m" ("A5", "Dsus4"). */
export function styledChordName(label: string, quality: ChordQuality, recipe: ChordRecipe) {
	if (quality === "diminished") return `${label}${recipe.suffix || "°"}`;
	const root = recipe.rootOnly && quality === "minor" ? label.replace(/m$/, "") : label;
	return `${root}${recipe.suffix}`;
}
