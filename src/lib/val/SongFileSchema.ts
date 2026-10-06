import * as v from "valibot";
import { NanoIdSchema } from "./NanoIdSchema";

/** An attachment's own words (docs/data-model.md, song_pdf): an optional title and description, trimmed and capped; `isNotation` when the flag is being set. */
export const SongFileUpdateSchema = v.object({
	id: NanoIdSchema,
	isNotation: v.optional(v.boolean()),
	title: v.pipe(v.string(), v.trim(), v.maxLength(120, "Keep the title under 120 characters.")),
	description: v.pipe(
		v.string(),
		v.trim(),
		v.maxLength(1000, "Keep the description under 1,000 characters."),
	),
});
export type SongFileUpdate = v.InferOutput<typeof SongFileUpdateSchema>;

export const SongFileDeleteSchema = v.object({ id: NanoIdSchema });

/** A file moved to a song of its project, or to the project level with `songId` null (docs/uploads-and-blob.md, "Attachments"). */
export const SongFileAttachSchema = v.object({
	id: NanoIdSchema,
	songId: v.nullable(NanoIdSchema),
});
export type SongFileAttach = v.InferOutput<typeof SongFileAttachSchema>;
export type SongFileDelete = v.InferOutput<typeof SongFileDeleteSchema>;

/** An audio attachment copied into the song's demos (docs/uploads-and-blob.md, "Attachments"). */
export const SongFileUseAsDemoSchema = v.object({ id: NanoIdSchema });
export type SongFileUseAsDemo = v.InferOutput<typeof SongFileUseAsDemoSchema>;
