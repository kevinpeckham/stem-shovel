import * as v from "valibot";
import { NameSchema } from "./NameSchema";
import { NanoIdSchema } from "./NanoIdSchema";
import { SlugSchema } from "./SlugSchema";

/** Form boundary for the project settings form (name + URL). */
export const ProjectSettingsSchema = v.object({
	id: NanoIdSchema,
	name: NameSchema,
	slug: SlugSchema,
});

export type ProjectSettings = v.InferOutput<typeof ProjectSettingsSchema>;
