import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import type { CreditRole } from "../../../val/CreditRoleSchema";
import { artist } from "./artist";
import { id, timestamps } from "./columns";
import { song } from "./song";

/**
 * An artist credited on a song in a role (migration 0048): performers make
 * the artist line under the title, composers "Written by", producers
 * "Produced by". One row per artist and role on a song.
 */
export const songCredit = table(
	"song_credit",
	{
		id: id(),
		songId: t
			.text("song_id")
			.notNull()
			.references(() => song.id, { onDelete: "cascade" }),
		artistId: t
			.text("artist_id")
			.notNull()
			.references(() => artist.id, { onDelete: "cascade" }),
		role: t.text("role").$type<CreditRole>().notNull(),
		sortOrder: t.integer("sort_order").notNull().default(0),
		...timestamps,
	},
	(table) => [
		t.index("song_credit_song_idx").on(table.songId),
		t.index("song_credit_artist_idx").on(table.artistId),
		t.unique("song_credit_unique").on(table.songId, table.artistId, table.role),
	],
);
