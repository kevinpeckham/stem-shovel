import * as v from "valibot";
import { EmailSchema } from "./EmailSchema";
import { NanoIdSchema } from "./NanoIdSchema";

/** Argument of the shareSong command: who to send the song's link to, and a note. */
export const ShareSongSchema = v.object({
	songId: NanoIdSchema,
	to: EmailSchema,
	message: v.optional(
		v.pipe(v.string(), v.trim(), v.maxLength(2000, "Keep the note under 2000 characters.")),
		"",
	),
});
