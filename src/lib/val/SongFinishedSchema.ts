import * as v from "valibot";
import { NanoIdSchema } from "./NanoIdSchema";

/** Any member marks a song finished (or back in progress); "true" = finished. */
export const SongFinishedSchema = v.object({
	id: NanoIdSchema,
	finished: v.picklist(["true", "false"]),
});
