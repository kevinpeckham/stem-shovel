import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import { id, timestamps } from "./columns";
import { user } from "./user";
import { userDoc } from "./userDoc";

/** One saved revision of a user-doc page; the ten most recent are kept (data.saveUserDoc). */
export const userDocVersion = table(
	"user_doc_version",
	{
		id: id(),
		docId: t
			.text("doc_id")
			.notNull()
			.references(() => userDoc.id, { onDelete: "cascade" }),
		versionNumber: t.integer("version_number").notNull(),
		markdown: t.text("markdown").notNull(),
		contentHash: t.text("content_hash").notNull(),
		createdBy: t.text("created_by").references(() => user.id, { onDelete: "set null" }),
		...timestamps,
	},
	(table) => [
		t.index("user_doc_version_doc_idx").on(table.docId, table.versionNumber),
		t.index("user_doc_version_created_by_idx").on(table.createdBy),
	],
);
