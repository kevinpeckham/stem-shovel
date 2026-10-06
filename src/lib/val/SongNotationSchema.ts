import * as v from "valibot";
import { NanoIdSchema } from "./NanoIdSchema";

/** A notation file's own words (docs/data-model.md, song_notation): an optional title and description, trimmed and capped. */
export const NotationUpdateSchema = v.object({
	id: NanoIdSchema,
	title: v.pipe(v.string(), v.trim(), v.maxLength(120, "Keep the title under 120 characters.")),
	description: v.pipe(
		v.string(),
		v.trim(),
		v.maxLength(1000, "Keep the description under 1,000 characters."),
	),
});
export type NotationUpdate = v.InferOutput<typeof NotationUpdateSchema>;

export const NotationDeleteSchema = v.object({ id: NanoIdSchema });
export type NotationDelete = v.InferOutput<typeof NotationDeleteSchema>;
