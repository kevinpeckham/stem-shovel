import * as v from "valibot";
import { DrumProjectSchema } from "./DrumPatternSchema";
import { NameSchema } from "./NameSchema";
import { NanoIdSchema } from "./NanoIdSchema";

/** Argument of the saveBeat command: a new beat in the account, or the one named by `id` brought up to date. */
export const BeatSaveSchema = v.object({
	accountId: NanoIdSchema,
	id: v.optional(NanoIdSchema),
	name: NameSchema,
	data: DrumProjectSchema,
	/** A new beat can belong to a song of the account (the song page opened the drum machine). */
	songId: v.optional(NanoIdSchema),
});
export type BeatSave = v.InferOutput<typeof BeatSaveSchema>;

/** Argument of the renameBeat command. */
export const BeatRenameSchema = v.object({ id: NanoIdSchema, name: NameSchema });
export type BeatRename = v.InferOutput<typeof BeatRenameSchema>;

/** Argument of the listBeats query. */
export const BeatListSchema = v.object({ accountId: NanoIdSchema });
