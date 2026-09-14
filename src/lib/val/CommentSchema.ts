import * as v from "valibot";
import { NanoIdSchema } from "./NanoIdSchema";

/** A position as typed — time, timecode or bars — or empty; the server converts it. */
const PositionSchema = v.optional(v.pipe(v.string(), v.trim(), v.maxLength(32)), "");

const TitleSchema = v.pipe(
	v.string(),
	v.trim(),
	v.minLength(1, "Give the comment a title."),
	v.maxLength(120, "Keep the title under 120 characters."),
);

const BodySchema = v.pipe(
	v.string(),
	v.trim(),
	v.minLength(1, "Write something."),
	v.maxLength(5000, "Keep the comment under 5000 characters."),
);

/** Form boundary for posting a comment on a song. */
export const CommentCreateSchema = v.object({
	songId: NanoIdSchema,
	title: TitleSchema,
	body: BodySchema,
	position: PositionSchema,
});

/** Form boundary for editing one's own comment. */
export const CommentUpdateSchema = v.object({
	id: NanoIdSchema,
	title: TitleSchema,
	body: BodySchema,
	position: PositionSchema,
});

export type CommentInput = v.InferOutput<typeof CommentCreateSchema>;
