import * as v from "valibot";
import { DRUM_VOICE_IDS } from "$lib/constants/drumMachine";
import { NameSchema } from "./NameSchema";
import { NanoIdSchema } from "./NanoIdSchema";

/** A voice of the drum machine, the sample a kit holds for it. */
export const DrumVoiceSchema = v.picklist(DRUM_VOICE_IDS);

/** Argument of createDrumKit: an account's kit, or the site's when `accountId` is absent (a system admin's). */
export const DrumKitCreateSchema = v.object({
	accountId: v.optional(NanoIdSchema),
	name: NameSchema,
});
export type DrumKitCreate = v.InferOutput<typeof DrumKitCreateSchema>;

export const DrumKitRenameSchema = v.object({ id: NanoIdSchema, name: NameSchema });
export type DrumKitRename = v.InferOutput<typeof DrumKitRenameSchema>;

/** Argument of listDrumKits: the site's kits and, with an account, its own. */
export const DrumKitListSchema = v.object({ accountId: v.optional(NanoIdSchema) });
export type DrumKitList = v.InferOutput<typeof DrumKitListSchema>;
