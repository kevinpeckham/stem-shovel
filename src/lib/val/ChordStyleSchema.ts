import * as v from "valibot";
import { CHORD_RECIPES } from "../constants/chordStyles";
import { NameSchema } from "./NameSchema";
import { NanoIdSchema } from "./NanoIdSchema";

/**
 * A custom chord style (docs/chord-player.md, "Styles"): for each of the
 * twelve degrees (fifths from the key, 0 = I, 1 = V, 11 = IV…) the recipe a
 * major wedge and a minor wedge carry, and what the 7 pad raises each to.
 * Saved to an account by name, as a progression is.
 */
const RecipeIdSchema = v.picklist(Object.keys(CHORD_RECIPES) as (keyof typeof CHORD_RECIPES)[]);
const DegreeSchema = v.object({ plain: RecipeIdSchema, held: RecipeIdSchema });
const RingSchema = v.pipe(v.array(DegreeSchema), v.length(12));

export const ChordStyleDataSchema = v.object({ major: RingSchema, minor: RingSchema });
export type ChordStyleData = v.InferOutput<typeof ChordStyleDataSchema>;

/** A saved style as the page and the engine hold it. */
export interface SavedChordStyle {
	id: string;
	name: string;
	data: ChordStyleData;
	updatedAt: Date;
}

export const ChordStyleSaveSchema = v.object({
	accountId: NanoIdSchema,
	id: v.optional(NanoIdSchema),
	name: NameSchema,
	data: ChordStyleDataSchema,
});
export const ChordStyleRenameSchema = v.object({ id: NanoIdSchema, name: NameSchema });
export const ChordStyleListSchema = v.object({ accountId: NanoIdSchema });
