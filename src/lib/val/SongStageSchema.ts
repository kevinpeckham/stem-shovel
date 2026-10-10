import * as v from "valibot";
import { NanoIdSchema } from "./NanoIdSchema";

/**
 * A song's stage (docs/mixes.md, "Phase 2"): where it is in its life,
 * from the writing that ends in a demo, through the arranging with stems,
 * to the mixing after the studio, and done. Set in song settings, or left
 * to be read from what the song holds (`utils/songStage.ts`).
 */
export const SONG_STAGES = ["writing", "arranging", "mixing", "finished"] as const;
export const SongStageSchema = v.picklist(SONG_STAGES);
export type SongStage = v.InferOutput<typeof SongStageSchema>;

/** The settings form: a stage, or "" to go back to reading it from the song. */
export const SongStageSetSchema = v.object({
	id: NanoIdSchema,
	stage: v.optional(v.union([SongStageSchema, v.literal("")]), ""),
});
