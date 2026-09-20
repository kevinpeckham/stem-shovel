import * as v from "valibot";
import { NanoIdSchema } from "./NanoIdSchema";
import { CreditRoleSchema } from "./CreditRoleSchema";

/** An artist's name as typed: the account's directory matches it case-insensitively. */
export const ArtistNameSchema = v.pipe(
	v.string(),
	v.trim(),
	v.nonEmpty("Give the artist a name."),
	v.maxLength(120, "Keep the name under 120 characters."),
);

/** Credit an artist (by name; found in the account's directory or created) on a song in a role. */
export const SongCreditAddSchema = v.object({
	songId: NanoIdSchema,
	role: CreditRoleSchema,
	name: ArtistNameSchema,
});

export type SongCreditAdd = v.InferOutput<typeof SongCreditAddSchema>;
