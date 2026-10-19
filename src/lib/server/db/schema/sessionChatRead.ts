import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import { recordingSession } from "./recordingSession";
import { user } from "./user";

/**
 * When one person last looked at one session's chat (docs/chat.md,
 * "Sessions"), as chat_read for a song's: the unread mark and the "New"
 * line. No row means they have never looked. Deleted with the session and
 * the user.
 */
export const sessionChatRead = table(
	"session_chat_read",
	{
		userId: t
			.text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		sessionId: t
			.text("session_id")
			.notNull()
			.references(() => recordingSession.id, { onDelete: "cascade" }),
		readAt: t.integer("read_at", { mode: "timestamp_ms" }).notNull(),
	},
	(table) => [
		t.primaryKey({ columns: [table.userId, table.sessionId] }),
		t.index("session_chat_read_session_idx").on(table.sessionId),
	],
);
