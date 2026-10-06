import * as v from "valibot";
import { NanoIdSchema } from "./NanoIdSchema";

/** A PDF's own words (docs/data-model.md, song_pdf): an optional title and description, trimmed and capped; `isNotation` when the flag is being set. */
export const SongPdfUpdateSchema = v.object({
	id: NanoIdSchema,
	isNotation: v.optional(v.boolean()),
	title: v.pipe(v.string(), v.trim(), v.maxLength(120, "Keep the title under 120 characters.")),
	description: v.pipe(
		v.string(),
		v.trim(),
		v.maxLength(1000, "Keep the description under 1,000 characters."),
	),
});
export type SongPdfUpdate = v.InferOutput<typeof SongPdfUpdateSchema>;
