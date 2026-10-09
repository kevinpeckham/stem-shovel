import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import { song } from "./song";
import { user } from "./user";

/**
 * When one person last looked at one song's chat (docs/chat.md), so the
 * tab can carry an unread mark and the list a "New" line. No row means
 * they have never looked. Deleted with the song and the user.
 */
export const chatRead = table(
	"chat_read",
	{
		userId: t
			.text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		songId: t
			.text("song_id")
			.notNull()
			.references(() => song.id, { onDelete: "cascade" }),
		readAt: t.integer("read_at", { mode: "timestamp_ms" }).notNull(),
	},
	(table) => [
		t.primaryKey({ columns: [table.userId, table.songId] }),
		t.index("chat_read_song_idx").on(table.songId),
	],
);
