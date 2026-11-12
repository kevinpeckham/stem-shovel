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
	/** Feedback on a mix of the song (docs/mixes.md): the mix's id; empty for the song's own stream. */
	mixId: v.optional(v.union([NanoIdSchema, v.literal("")]), ""),
	/** A comment on one of the song's demo recordings: the demo's id; empty otherwise. */
	demoId: v.optional(v.union([NanoIdSchema, v.literal("")]), ""),
	title: TitleSchema,
	body: BodySchema,
	position: PositionSchema,
	/** The alternate arrangement the position was typed on, so bars are read on its grid when it has settings of its own (docs/arrangements.md); empty for Main. */
	arrangementId: v.optional(v.union([NanoIdSchema, v.literal("")]), ""),
});

/** Form boundary for editing one's own comment. */
export const CommentUpdateSchema = v.object({
	id: NanoIdSchema,
	title: TitleSchema,
	body: BodySchema,
	position: PositionSchema,
	/** The alternate arrangement the position was typed on, so bars are read on its grid when it has settings of its own (docs/arrangements.md); empty for Main. */
	arrangementId: v.optional(v.union([NanoIdSchema, v.literal("")]), ""),
});

/** The person opened a demo in the song page's Demos view: its new comments are seen. */
export const DemoCommentsSeenSchema = v.object({ songId: NanoIdSchema, demoId: NanoIdSchema });

export type CommentInput = v.InferOutput<typeof CommentCreateSchema>;
