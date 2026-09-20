import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import type { ArtistKind } from "../../../val/ArtistKindSchema";
import { account } from "./account";
import { id, timestamps } from "./columns";

/**
 * An artist in an account's directory (migration 0048): a band, a solo
 * act, a producer, a writer — anyone credited on a song. Names are unique
 * within the account; a song's credits (song_credit) point here, so the
 * same act on twenty songs is one record. Details (website, members) grow
 * here later.
 */
export const artist = table(
	"artist",
	{
		id: id(),
		accountId: t
			.text("account_id")
			.notNull()
			.references(() => account.id, { onDelete: "cascade" }),
		name: t.text("name").notNull(),
		/** "person" (a solo artist, with their own email here) or "group" (a band; its people are artist_member rows). Migration 0051. */
		kind: t.text("kind").$type<ArtistKind>().notNull().default("group"),
		/** A solo artist's email, for the member badge and an invitation; empty for a group. */
		email: t.text("email").notNull().default(""),
		/** For ordering: "Beatles, The"; empty means the name itself. */
		sortName: t.text("sort_name").notNull().default(""),
		website: t.text("website").notNull().default(""),
		note: t.text("note").notNull().default(""),
		/** The artist's picture (migration 0052), or null. */
		imageUrl: t.text("image_url"),
		...timestamps,
	},
	(table) => [
		t.index("artist_account_idx").on(table.accountId),
		t.unique("artist_account_name_unique").on(table.accountId, table.name),
	],
);
