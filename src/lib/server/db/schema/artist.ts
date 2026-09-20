import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
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
		/** For ordering: "Beatles, The"; empty means the name itself. */
		sortName: t.text("sort_name").notNull().default(""),
		website: t.text("website").notNull().default(""),
		note: t.text("note").notNull().default(""),
		...timestamps,
	},
	(table) => [
		t.index("artist_account_idx").on(table.accountId),
		t.unique("artist_account_name_unique").on(table.accountId, table.name),
	],
);
