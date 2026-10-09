import * as v from "valibot";
import { NanoIdSchema } from "./NanoIdSchema";

/** The text of a chat message as typed: trimmed, something in it, not a wall. */
export const CHAT_MESSAGE_MAX = 2000;
const BodySchema = v.pipe(
	v.string(),
	v.trim(),
	v.minLength(1, "Write something."),
	v.maxLength(CHAT_MESSAGE_MAX, `Keep a message under ${CHAT_MESSAGE_MAX} characters.`),
);

/** Form boundary for sending a message to a song's chat (docs/chat.md). */
export const ChatSendSchema = v.object({
	songId: NanoIdSchema,
	body: BodySchema,
});

/** Form boundary for editing one's own message. */
export const ChatEditSchema = v.object({
	id: NanoIdSchema,
	body: BodySchema,
});

/** A song's chat as seen by one person: the messages, and where they marked it read. */
export const ChatSongSchema = v.object({ songId: NanoIdSchema });

/** The messages changed since a moment (ms since the epoch), for the poll; 0 for all of them. */
export const ChatSinceSchema = v.object({
	songId: NanoIdSchema,
	after: v.optional(v.pipe(v.number(), v.minValue(0)), 0),
});

export type ChatSendInput = v.InferOutput<typeof ChatSendSchema>;
