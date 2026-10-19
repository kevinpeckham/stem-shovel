import * as v from "valibot";
import { NanoIdSchema } from "./NanoIdSchema";

/** A position in the recording as typed (time, "1:23.4") or empty; the server reads it. */
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

/** Form boundary for posting a comment on a session's recording (docs/uploads-and-blob.md, "Sessions" review). */
export const SessionCommentCreateSchema = v.object({
	recordingId: NanoIdSchema,
	title: TitleSchema,
	body: BodySchema,
	position: PositionSchema,
});

/** Form boundary for editing one's own comment on a recording. */
export const SessionCommentUpdateSchema = v.object({
	id: NanoIdSchema,
	title: TitleSchema,
	body: BodySchema,
	position: PositionSchema,
});

export type SessionCommentInput = v.InferOutput<typeof SessionCommentCreateSchema>;
