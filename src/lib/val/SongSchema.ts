import * as v from "valibot";
import { NameSchema } from "./NameSchema";
import { NanoIdSchema } from "./NanoIdSchema";
import { SlugSchema } from "./SlugSchema";
import { SongDocKindSchema } from "./SongDocKindSchema";

/** Form boundary for the song settings form (title, URL, description). */
export const SongSettingsSchema = v.object({
	id: NanoIdSchema,
	title: NameSchema,
	slug: SlugSchema,
	description: v.optional(
		v.pipe(v.string(), v.trim(), v.maxLength(2000, "Keep the description under 2000 characters.")),
		"",
	),
});

export type SongSettings = v.InferOutput<typeof SongSettingsSchema>;

/** Form boundary for saving a song document (chart or lyrics). */
export const SongDocSaveSchema = v.object({
	songId: NanoIdSchema,
	kind: SongDocKindSchema,
	markdown: v.pipe(v.string(), v.maxLength(200_000)),
	/** "true" on the second submit of an intentionally empty document (hidden inputs carry strings). */
	confirmEmpty: v.optional(v.picklist(["true", "false"]), "false"),
});

export type SongDocSave = v.InferOutput<typeof SongDocSaveSchema>;

/** Form boundary for creating a song in a project. */
export const SongCreateSchema = v.object({ projectId: NanoIdSchema, title: NameSchema });

/** Form boundary for deleting a song or a stem by id. */
export const IdSchema = v.object({ id: NanoIdSchema });
