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

/** Form boundary for creating a project. */
export const ProjectCreateSchema = v.object({ accountId: NanoIdSchema, name: NameSchema });
