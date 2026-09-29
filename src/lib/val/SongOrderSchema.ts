import * as v from "valibot";
import { NanoIdSchema } from "./NanoIdSchema";

/** The reorderSongs command: a project's songs in the order the lists should take, top first. */
export const SongOrderSchema = v.object({
	projectId: NanoIdSchema,
	ids: v.pipe(v.array(NanoIdSchema), v.minLength(1), v.maxLength(500)),
});
export type SongOrder = v.InferOutput<typeof SongOrderSchema>;
