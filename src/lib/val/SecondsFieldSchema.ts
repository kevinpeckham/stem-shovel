import * as v from "valibot";

/**
 * A position field of a form in seconds, as text: "" for none (the start or
 * the end of the audio), else a decimal. The page reads what was typed in
 * any position format and carries the seconds (the song's start of bar 1
 * and end, and an arrangement's own).
 */
export const SecondsFieldSchema = v.optional(
	v.union([v.literal(""), v.pipe(v.string(), v.trim(), v.decimal("Not a time."))]),
	"",
);
