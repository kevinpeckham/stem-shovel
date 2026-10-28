import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import { account } from "./account";
import { id, timestamps } from "./columns";
import { user } from "./user";

/**
 * A set list (docs/band-plan.md, phase 1): an ordered list of what to
 * play, the account's, named ("Spring tour", "Acoustic set"), with notes.
 * Its rows are `set_list_item`. One body: a show with two sets attaches
 * two set lists, which keeps a set reusable. Deleted with the account
 * (src/lib/server/cascade.ts); a share link may open its show view.
 */
export const setList = table(
	"set_list",
	{
		id: id(),
		accountId: t
			.text("account_id")
			.notNull()
			.references(() => account.id, { onDelete: "cascade" }),
		title: t.text("title").notNull(),
		/** Markdown: the night's plan, tunings, who brings what. */
		notes: t.text("notes").notNull().default(""),
		createdBy: t.text("created_by").references(() => user.id, { onDelete: "set null" }),
		...timestamps,
	},
	(table) => [
		t.index("set_list_account_idx").on(table.accountId),
		t.index("set_list_created_by_idx").on(table.createdBy),
	],
);
