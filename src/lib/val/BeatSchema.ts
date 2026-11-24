import * as v from "valibot";
import { DrumProjectSchema } from "./DrumPatternSchema";
import { ExpressionProjectSchema } from "./ExpressionDrumSchema";
import { NameSchema } from "./NameSchema";
import { NanoIdSchema } from "./NanoIdSchema";

/**
 * Argument of the saveBeat command: a new beat in the account, or the one
 * named by `id` brought up to date. The project is the drum machine's or
 * expression drums' (its cells are objects, so the two never pass for each
 * other); listBeats gives the drum machine's pages only theirs.
 */
export const BeatSaveSchema = v.object({
	accountId: NanoIdSchema,
	id: v.optional(NanoIdSchema),
	name: NameSchema,
	data: v.union([DrumProjectSchema, ExpressionProjectSchema]),
	/** A new beat can belong to a song of the account (the song page opened the drum machine). */
	songId: v.optional(NanoIdSchema),
});
export type BeatSave = v.InferOutput<typeof BeatSaveSchema>;

/** Argument of the renameBeat command. */
export const BeatRenameSchema = v.object({ id: NanoIdSchema, name: NameSchema });
export type BeatRename = v.InferOutput<typeof BeatRenameSchema>;

/** Argument of the listBeats query. */
export const BeatListSchema = v.object({ accountId: NanoIdSchema });
