import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import { account } from "./account";
import { id, timestamps } from "./columns";
import { song } from "./song";
import { user } from "./user";

/**
 * One message in a song's chat (docs/chat.md): plain text by someone on
 * the song's project, in time order under the song. `editedAt` marks a
 * message changed after it was sent; there is no revision history.
 * Deleted with the song, the account and the author (cascade.ts).
 */
export const chatMessage = table(
	"chat_message",
	{
		id: id(),
		accountId: t
			.text("account_id")
			.notNull()
			.references(() => account.id, { onDelete: "cascade" }),
		songId: t
			.text("song_id")
			.notNull()
			.references(() => song.id, { onDelete: "cascade" }),
		userId: t
			.text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		body: t.text("body").notNull(),
		editedAt: t.integer("edited_at", { mode: "timestamp_ms" }),
		...timestamps,
	},
	(table) => [
		t.index("chat_message_song_idx").on(table.songId, table.createdAt),
		t.index("chat_message_user_idx").on(table.userId),
	],
);
