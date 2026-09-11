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
