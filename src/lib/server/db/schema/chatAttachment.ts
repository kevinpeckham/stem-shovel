import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import type { FileKind } from "../../../constants/fileFormats";
import { account } from "./account";
import { chatMessage } from "./chatMessage";
import { id, shareCodeColumn, thumbnailColumns, timestamps, uploadColumns } from "./columns";
import { recordingSession } from "./recordingSession";
import { sessionChatMessage } from "./sessionChatMessage";
import { song } from "./song";
import { user } from "./user";

/**
 * A file carried by a chat message (docs/chat.md, "Attachments"): a
 * picture, a PDF, audio, anything an attachment may be (`FILE_KINDS`).
 * Uploaded first, then sent, as Slack does: the row is reserved under the
 * chat it was dropped into (a song's or a session's, one of them), goes
 * through the reserve → upload → ready lifecycle of an event's file
 * (`/api/chat/attachments`, `/api/chat-attachments/<id>/ready`; the server
 * checks the first bytes by kind), and waits unattached until its uploader
 * sends a message with it, which sets `messageId` or `sessionMessageId`.
 * A pending row nobody sent goes at its uploader's next reserve after a
 * day (`CHAT_ATTACHMENT_STALE_MS`). The chat is members-only, but the
 * files live in the public store under `accounts/<a>/chat/`: the pathname
 * is an unguessable id, and a share code is the file's permanent address
 * (`/f/<code>`). Deleted with its message, its song or session, the
 * account and the author's messages (src/lib/server/cascade.ts; the blobs
 * by the caller).
 */
export const chatAttachment = table(
	"chat_attachment",
	{
		id: id(),
		accountId: t
			.text("account_id")
			.notNull()
			.references(() => account.id, { onDelete: "cascade" }),
		/** The song whose chat it was uploaded to; null for a session's. */
		songId: t.text("song_id").references(() => song.id, { onDelete: "cascade" }),
		/** The session whose chat it was uploaded to; null for a song's. */
		sessionId: t.text("session_id").references(() => recordingSession.id, { onDelete: "cascade" }),
		/** The song chat's message that carries it; null while pending or in a session's chat. */
		messageId: t.text("message_id").references(() => chatMessage.id, { onDelete: "cascade" }),
		/** The session chat's message that carries it; null while pending or in a song's chat. */
		sessionMessageId: t
			.text("session_message_id")
			.references(() => sessionChatMessage.id, { onDelete: "cascade" }),
		kind: t.text("kind").$type<FileKind>().notNull(),
		...uploadColumns(),
		/** From the extension (constants/fileFormats.ts): what `/f/<code>?download=1` sends it as. */
		contentType: t.text("content_type").notNull(),
		/** An image's size as the browser measured it (a PDF's first page); null when it did not. */
		width: t.integer("width"),
		height: t.integer("height"),
		...thumbnailColumns(),
		shareCode: shareCodeColumn(),
		uploadedBy: t.text("uploaded_by").references(() => user.id, { onDelete: "set null" }),
		...timestamps,
	},
	(table) => [
		t.index("chat_attachment_account_idx").on(table.accountId),
		t.index("chat_attachment_song_idx").on(table.songId),
		t.index("chat_attachment_session_idx").on(table.sessionId),
		t.index("chat_attachment_message_idx").on(table.messageId),
		t.index("chat_attachment_session_message_idx").on(table.sessionMessageId),
		t.index("chat_attachment_uploaded_by_idx").on(table.uploadedBy),
	],
);
