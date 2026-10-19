import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import { account } from "./account";
import { id, timestamps } from "./columns";
import { idea } from "./idea";
import { user } from "./user";

/**
 * A comment on a Dawn song (docs/dawn-daw-plan.md, D7): plain text by
 * someone who may work on the song, optionally pinned to a moment in it
 * (`at`, seconds) so it sits on the ruler. Deleted with the song
 * (cascade.ts) and with its author.
 */
export const studioComment = table(
	"studio_comment",
	{
		id: id(),
		accountId: t
			.text("account_id")
			.notNull()
			.references(() => account.id, { onDelete: "cascade" }),
		ideaId: t
			.text("idea_id")
			.notNull()
			.references(() => idea.id, { onDelete: "cascade" }),
		userId: t
			.text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		body: t.text("body").notNull(),
		at: t.real("at"),
		...timestamps,
	},
	(table) => [
		t.index("studio_comment_account_idx").on(table.accountId),
		t.index("studio_comment_idea_idx").on(table.ideaId, table.createdAt),
		t.index("studio_comment_user_idx").on(table.userId),
	],
);
