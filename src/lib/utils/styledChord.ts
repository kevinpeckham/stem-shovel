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

/** The chord's name from the wedge's label (a minor's carries its "m": "Am") and the recipe: "C", "Cmaj7", "Am7", "Bm7♭5", "G13". */
export function styledChordName(label: string, quality: ChordQuality, recipe: ChordRecipe) {
	if (quality === "diminished") return `${label}${recipe.suffix || "°"}`;
	return `${label}${recipe.suffix}`;
}
