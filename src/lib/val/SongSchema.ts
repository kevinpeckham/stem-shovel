import * as v from "valibot";
import { NameSchema } from "./NameSchema";
import { NanoIdSchema } from "./NanoIdSchema";
import { SlugSchema } from "./SlugSchema";

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
