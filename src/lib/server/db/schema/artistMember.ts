import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import { artist } from "./artist";
import { id, timestamps } from "./columns";

/**
 * A person in an artist (migration 0050): the drummer, the second MC, the
 * engineer. A name, what they do, and an email when known, which is what
 * lets an owner or admin invite them into the account from the artist's
 * page. Not a user: a member of the account is a separate thing
 * (account_member), matched by email when it shows.
 */
export const artistMember = table(
	"artist_member",
	{
		id: id(),
		artistId: t
			.text("artist_id")
			.notNull()
			.references(() => artist.id, { onDelete: "cascade" }),
		name: t.text("name").notNull(),
		/** What they do: "drums", "vocals, guitar", "producer". */
		role: t.text("role").notNull().default(""),
		email: t.text("email").notNull().default(""),
		sortOrder: t.integer("sort_order").notNull().default(0),
		...timestamps,
	},
	(table) => [t.index("artist_member_artist_idx").on(table.artistId)],
);
