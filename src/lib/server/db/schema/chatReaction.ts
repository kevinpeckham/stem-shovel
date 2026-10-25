import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import type { ChatReactionEmoji } from "../../../val/ChatSchema";
import { id, timestamps } from "./columns";
import { user } from "./user";

/**
 * One person's reaction to one chat message (docs/chat.md, "Reactions"):
 * an emoji from the fixed set (`CHAT_REACTION_EMOJI`), once per person per
 * message. `scope` says which table holds the message, a song's
 * `chat_message` or a session's `session_chat_message`, since the two
 * share this table; the message's id is a nanoid, unique across both.
 * Deleted with its message, the message's song, session and account, and
 * the reacting user (cascade.ts).
 */
export const chatReaction = table(
	"chat_reaction",
	{
		id: id(),
		scope: t.text("scope").$type<"song" | "session">().notNull(),
		messageId: t.text("message_id").notNull(),
		userId: t
			.text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		emoji: t.text("emoji").$type<ChatReactionEmoji>().notNull(),
		...timestamps,
	},
	(table) => [
		t.uniqueIndex("chat_reaction_once_idx").on(table.messageId, table.userId, table.emoji),
		t.index("chat_reaction_message_idx").on(table.messageId),
		t.index("chat_reaction_user_idx").on(table.userId),
	],
);
