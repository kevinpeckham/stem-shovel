import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import { account } from "./account";
import { id, timestamps } from "./columns";
import { song } from "./song";
import { user } from "./user";

/**
 * A comment on a song by a member of its account: a title, plain text, and
 * optionally a position in the song (`at`, seconds) so it can sit on the
 * comment timeline under the stems. `editedAt` marks a comment changed
 * after it was posted.
 */
export const comment = table(
	"comment",
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
		title: t.text("title").notNull(),
		body: t.text("body").notNull(),
		at: t.real("at"),
		editedAt: t.integer("edited_at", { mode: "timestamp_ms" }),
		...timestamps,
	},
	(table) => [
		t.index("comment_song_idx").on(table.songId, table.createdAt),
		t.index("comment_user_idx").on(table.userId),
	],
);
