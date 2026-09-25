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

/** Restricting a project to the people added to it (and the account's owners and admins). */
export const ProjectRestrictSchema = v.object({
	id: NanoIdSchema,
	restricted: v.picklist(["true", "false"]),
});

/** Adding an account member to a project, or removing anyone from it. */
export const ProjectPersonSchema = v.object({ projectId: NanoIdSchema, userId: NanoIdSchema });

/** Form boundary for creating a project. */
export const ProjectCreateSchema = v.object({ accountId: NanoIdSchema, name: NameSchema });
