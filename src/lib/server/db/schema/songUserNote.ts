import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import { account } from "./account";
import { id, timestamps } from "./columns";
import { song } from "./song";
import { user } from "./user";

/**
 * One person's private notepad on a song (the "mynotes" document on the
 * song page): markdown and its sanitised rendering, one row per user and
 * song. Only its author ever reads it (data.getUserNote takes the user id);
 * it is never listed, exported or shared. Saved like the shared documents
 * (data.saveUserNote): the version counts saves, but there is no history.
 */
export const songUserNote = table(
	"song_user_note",
	{
		id: id(),
		/** Denormalized from the song so tenant scoping never needs a join. */
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
		markdown: t.text("markdown").notNull().default(""),
		/** renderMarkdown(markdown), kept so a page load renders nothing. */
		html: t.text("html").notNull().default(""),
		/** Counts saves that changed the text; 0 = never saved. */
		version: t.integer("version").notNull().default(0),
		...timestamps,
	},
	(table) => [
		t.unique("song_user_note_unique").on(table.songId, table.userId),
		t.index("song_user_note_account_idx").on(table.accountId),
		t.index("song_user_note_song_idx").on(table.songId),
		t.index("song_user_note_user_idx").on(table.userId),
	],
);
