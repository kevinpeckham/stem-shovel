import type { ChordRecipeId, ChordStyleId } from "#lib/constants/chordStyles.js";
import { CHORD_RECIPES } from "#lib/constants/chordStyles.js";
import type { SeventhType } from "#lib/constants/circleOfFifths.js";
import type { ChordStyleData } from "#lib/val/ChordStyleSchema.js";
import { styledChord } from "./styledChord";

/** A built-in style written out as custom style data, to start a custom style from (docs/chord-player.md, "Styles"). */
export function builtinStyleData(style: ChordStyleId, seventhType: SeventhType): ChordStyleData {
	const ids = Object.keys(CHORD_RECIPES) as ChordRecipeId[];
	const idOf = (intervals: readonly number[]) =>
		ids.find((id) => CHORD_RECIPES[id].intervals.join() === intervals.join()) ?? "major";
	const ring = (quality: "major" | "minor") =>
		Array.from({ length: 12 }, (_, fifths) => ({
			plain: idOf(styledChord(style, fifths, quality, false, seventhType).intervals),
			held: idOf(styledChord(style, fifths, quality, true, seventhType).intervals),
		}));
	return { major: ring("major"), minor: ring("minor") };
}
