import * as v from "valibot";
import { ChatScopeSchema } from "./ChatSchema";
import { NanoIdSchema } from "./NanoIdSchema";

/**
 * Step 1 of a chat attachment's upload (`POST /api/chat/attachments`,
 * docs/chat.md "Attachments"): the chat it goes to (a song's or a
 * session's; the route checks it names one), the file's name and its size.
 */
export const ChatAttachmentReserveSchema = v.object({
	...ChatScopeSchema.entries,
	filename: v.pipe(v.string(), v.trim(), v.nonEmpty(), v.maxLength(255)),
	sizeBytes: v.number(),
});
export type ChatAttachmentReserve = v.InferOutput<typeof ChatAttachmentReserveSchema>;

/** One chat attachment, by id: the pending file the composer's × removes. */
export const ChatAttachmentIdSchema = v.object({ id: NanoIdSchema });
export type ChatAttachmentId = v.InferOutput<typeof ChatAttachmentIdSchema>;
