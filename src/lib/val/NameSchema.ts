import * as v from "valibot";

/** Project names and song titles: any text, trimmed, 1–120 chars. */
export const NameSchema = v.pipe(
	v.string(),
	v.trim(),
	v.nonEmpty("A name is required."),
	v.maxLength(120, "Keep it under 120 characters."),
);

export type Name = v.InferOutput<typeof NameSchema>;
