import * as v from "valibot";
import { MAX_STEMS_PER_SONG } from "#lib/constants/stemFormats.js";
import { NanoIdSchema } from "./NanoIdSchema";

/** The reorderStems command: a song's stems in the order the rows should take, top first. */
export const StemOrderSchema = v.object({
	songId: NanoIdSchema,
	ids: v.pipe(v.array(NanoIdSchema), v.minLength(1), v.maxLength(MAX_STEMS_PER_SONG)),
});
export type StemOrder = v.InferOutput<typeof StemOrderSchema>;
