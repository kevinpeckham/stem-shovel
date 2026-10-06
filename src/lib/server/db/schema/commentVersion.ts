import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import { id, timestamps } from "./columns";
import { comment } from "./comment";
import { user } from "./user";

/**
 * The text a comment had before an edit replaced it: title, body and the
 * position (`at`, seconds, as on the comment), written by data.updateComment
 * before it overwrites them, so `created_at` is when that text was
 * replaced and `edited_by` who replaced it. The ten most recent per comment
 * are kept; deleting the comment removes them (cascade.ts).
 */
export const commentVersion = table(
	"comment_version",
	{
		id: id(),
		commentId: t
			.text("comment_id")
			.notNull()
			.references(() => comment.id, { onDelete: "cascade" }),
		title: t.text("title").notNull(),
		body: t.text("body").notNull(),
		at: t.real("at"),
		editedBy: t.text("edited_by").references(() => user.id, { onDelete: "set null" }),
		...timestamps,
	},
	(table) => [
		t.index("comment_version_comment_idx").on(table.commentId, table.createdAt),
		t.index("comment_version_edited_by_idx").on(table.editedBy),
	],
);
