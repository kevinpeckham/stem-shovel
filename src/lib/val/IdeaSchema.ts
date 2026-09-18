import * as v from "valibot";
import { NameSchema } from "./NameSchema";
import { NanoIdSchema } from "./NanoIdSchema";

/** Argument of the createIdea command: the idea's title (the recorder prefills "Untitled - <date> - <time>"). */
export const IdeaCreateSchema = v.object({ title: NameSchema });

/** Argument of the renameIdea command. */
export const IdeaRenameSchema = v.object({ id: NanoIdSchema, title: NameSchema });

/** Argument of the saveIdeaNotes command: the idea's markdown note board. */
export const IdeaNotesSchema = v.object({
	id: NanoIdSchema,
	markdown: v.pipe(v.string(), v.maxLength(50_000, "Keep the notes under 50,000 characters.")),
});

/** Argument of the setTakeName command: a take's optional name ("" clears it, "Take N" shows). */
export const TakeNameSchema = v.object({
	id: NanoIdSchema,
	title: v.pipe(v.string(), v.trim(), v.maxLength(120, "Keep it under 120 characters.")),
});

export type IdeaCreate = v.InferOutput<typeof IdeaCreateSchema>;
export type IdeaRename = v.InferOutput<typeof IdeaRenameSchema>;
export type IdeaNotes = v.InferOutput<typeof IdeaNotesSchema>;
export type TakeName = v.InferOutput<typeof TakeNameSchema>;
