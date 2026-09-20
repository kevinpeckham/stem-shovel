import * as v from "valibot";
import { NameSchema } from "./NameSchema";
import { NanoIdSchema } from "./NanoIdSchema";
import { SlugSchema } from "./SlugSchema";
import { ProjectTypeSchema } from "./ProjectTypeSchema";

/** Form boundary for the project settings form (name, URL, type). */
export const ProjectSettingsSchema = v.object({
	id: NanoIdSchema,
	name: NameSchema,
	slug: SlugSchema,
	type: v.optional(ProjectTypeSchema, "other"),
});

export type ProjectSettings = v.InferOutput<typeof ProjectSettingsSchema>;

/** Form boundary for creating a project. */
export const ProjectCreateSchema = v.object({ accountId: NanoIdSchema, name: NameSchema });
