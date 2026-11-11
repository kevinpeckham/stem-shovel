import * as v from "valibot";
import { MAX_STEMS_PER_SONG } from "#lib/constants/stemFormats.js";
import { ArrangementRefSchema } from "./ArrangementSchema";
import { NanoIdSchema } from "./NanoIdSchema";

/** The reorderStems command: one arrangement's stems (Main when `arrangementId` is null or absent) in the order the rows should take, top first. */
export const StemOrderSchema = v.object({
	songId: NanoIdSchema,
	ids: v.pipe(v.array(NanoIdSchema), v.minLength(1), v.maxLength(MAX_STEMS_PER_SONG)),
	arrangementId: ArrangementRefSchema,
});
export type StemOrder = v.InferOutput<typeof StemOrderSchema>;
