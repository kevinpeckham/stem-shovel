import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import { account } from "./account";
import { id, timestamps } from "./columns";
import { song } from "./song";
import { songMix } from "./songMix";
import { user } from "./user";

/**
 * A comment on a song by a member of its account: a title, plain text, and
 * optionally a position in the song (`at`, seconds) so it can sit on the
 * comment timeline under the stems. `editedAt` marks a comment changed
 * after it was posted. `mixId` set makes it feedback on that mix
 * (docs/mixes.md), kept with the mix rather than in the song's stream.
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
		mixId: t.text("mix_id").references(() => songMix.id, { onDelete: "cascade" }),
		title: t.text("title").notNull(),
		body: t.text("body").notNull(),
		at: t.real("at"),
		editedAt: t.integer("edited_at", { mode: "timestamp_ms" }),
		...timestamps,
	},
	(table) => [
		t.index("comment_song_idx").on(table.songId, table.createdAt),
		t.index("comment_user_idx").on(table.userId),
		t.index("comment_mix_idx").on(table.mixId),
	],
);
