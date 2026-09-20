import * as v from "valibot";
import { NameSchema } from "./NameSchema";
import { NanoIdSchema } from "./NanoIdSchema";
import { SlugSchema } from "./SlugSchema";

/** Form boundary for the account (org) settings form. */
export const AccountSettingsSchema = v.object({
	id: NanoIdSchema,
	name: NameSchema,
	slug: SlugSchema,
});

export type AccountSettings = v.InferOutput<typeof AccountSettingsSchema>;

/** The account's default artist for new songs: an artist id, or empty for none. */
export const AccountDefaultArtistSchema = v.object({
	accountId: NanoIdSchema,
	artistId: v.union([v.literal(""), NanoIdSchema]),
});

/** A member of any account starting another one of their own. */
export const AccountCreateSchema = v.object({ name: NameSchema });
