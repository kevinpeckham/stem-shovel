import { db, schema } from "#lib/server/db/index.js";
import { and, eq, inArray, isNull, or, type SQL } from "drizzle-orm";

const { chatAttachment, chatMessage, sessionChatMessage } = schema;

/**
 * The chat attachments that go with a deleted user (docs/chat.md,
 * "Attachments"): those on their messages in either chat, and their own
 * pending ones nobody sent. One `where`, so the delete
 * (src/lib/server/cascade.ts) and the gathering of the blobs before it
 * (data.ts `deleteUser`) pick the same rows; the messages' ids are read
 * first, while the messages are still there.
 */
export async function userChatAttachments(userId: string): Promise<SQL> {
	const [songMessages, sessionMessages] = await Promise.all([
		db.select({ id: chatMessage.id }).from(chatMessage).where(eq(chatMessage.userId, userId)),
		db
			.select({ id: sessionChatMessage.id })
			.from(sessionChatMessage)
			.where(eq(sessionChatMessage.userId, userId)),
	]);
	return or(
		inArray(
			chatAttachment.messageId,
			songMessages.map((m) => m.id),
		),
		inArray(
			chatAttachment.sessionMessageId,
			sessionMessages.map((m) => m.id),
		),
		and(
			eq(chatAttachment.uploadedBy, userId),
			isNull(chatAttachment.messageId),
			isNull(chatAttachment.sessionMessageId),
		),
	)!;
}
