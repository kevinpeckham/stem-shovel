import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import { account } from "./account";
import { id, timestamps } from "./columns";
import { user } from "./user";

/**
 * An idea from the Idea Recorder (docs/demo-recording.md): a title, one
 * note board, and one or more takes (`recording` rows). Ideas live in the
 * account's library; a take added to a song becomes a demo of that song.
 */
export const idea = table(
	"idea",
	{
		id: id(),
		accountId: t
			.text("account_id")
			.notNull()
			.references(() => account.id, { onDelete: "cascade" }),
		createdBy: t.text("created_by").references(() => user.id, { onDelete: "set null" }),
		title: t.text("title").notNull(),
		/** Markdown notes on the idea: chords, lyrics, where it might go. */
		notes: t.text("notes").notNull().default(""),
		...timestamps,
	},
	(table) => [
		t.index("idea_account_idx").on(table.accountId),
		t.index("idea_created_by_idx").on(table.createdBy),
	],
);
