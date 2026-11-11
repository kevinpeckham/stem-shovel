import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import { account } from "./account";
import { id, timestamps } from "./columns";
import { song } from "./song";
import { user } from "./user";

/**
 * An alternate arrangement of a song (docs/arrangements.md): another set
 * of stems for the same song, a different treatment or one member's ideas
 * for the band to consider. The song's own stems are its main arrangement
 * and have no row here: a stem with `arrangement_id` null belongs to Main,
 * so every song is its Main without a backfill, and a row here is always
 * an alternate. Stems of an alternate are stem rows of the same song with
 * this row's id; a stem copied from another arrangement shares its file.
 */
export const songArrangement = table(
	"song_arrangement",
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
		/** "Acoustic", "Sam's ideas"; unique within the song by the app, not the database. */
		name: t.text("name").notNull(),
		sortOrder: t.integer("sort_order").notNull().default(0),
		createdBy: t.text("created_by").references(() => user.id, { onDelete: "set null" }),
		...timestamps,
	},
	(table) => [
		t.index("song_arrangement_song_idx").on(table.songId, table.sortOrder),
		t.index("song_arrangement_account_idx").on(table.accountId),
		t.index("song_arrangement_created_by_idx").on(table.createdBy),
	],
);
