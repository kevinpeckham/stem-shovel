import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import { account } from "./account";
import { id, timestamps } from "./columns";
import { recordingSession } from "./recordingSession";
import { user } from "./user";

/**
 * One message in a session's chat (docs/chat.md, "Sessions"): a song's
 * chat_message, under a practice or a show instead of a song. Plain text
 * by a member of the account, in time order; `editedAt` marks a message
 * changed after it was sent. Deleted with the session, the account and the
 * author (cascade.ts).
 */
export const sessionChatMessage = table(
	"session_chat_message",
	{
		id: id(),
		accountId: t
			.text("account_id")
			.notNull()
			.references(() => account.id, { onDelete: "cascade" }),
		sessionId: t
			.text("session_id")
			.notNull()
			.references(() => recordingSession.id, { onDelete: "cascade" }),
		userId: t
			.text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		body: t.text("body").notNull(),
		editedAt: t.integer("edited_at", { mode: "timestamp_ms" }),
		...timestamps,
	},
	(table) => [
		t.index("session_chat_message_account_idx").on(table.accountId),
		t.index("session_chat_message_session_idx").on(table.sessionId, table.createdAt),
		t.index("session_chat_message_user_idx").on(table.userId),
	],
);
