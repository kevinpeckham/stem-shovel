import * as v from "valibot";
import { EVENT_FILE_KINDS } from "#lib/constants/eventFiles.js";
import { NanoIdSchema } from "./NanoIdSchema";

/** A show's or practice's file (docs/band-plan.md, "Posters, pictures and video"): a poster or a photo. */
export const EventFileKindSchema = v.picklist(EVENT_FILE_KINDS);

/** A photo's or poster's caption, trimmed; "" for none. */
export const EventFileCaptionSchema = v.object({
	id: NanoIdSchema,
	caption: v.pipe(v.string(), v.trim(), v.maxLength(300, "Keep the caption under 300 characters.")),
});
export type EventFileCaption = v.InferOutput<typeof EventFileCaptionSchema>;

export const EventFileIdSchema = v.object({ id: NanoIdSchema });
export type EventFileId = v.InferOutput<typeof EventFileIdSchema>;

/** Step 1 of an event file's upload (`POST /api/events/<id>/files`): what it is, its name and its size. */
export const EventFileReserveSchema = v.object({
	kind: EventFileKindSchema,
	filename: v.pipe(v.string(), v.trim(), v.nonEmpty(), v.maxLength(255)),
	sizeBytes: v.number(),
});
export type EventFileReserve = v.InferOutput<typeof EventFileReserveSchema>;
