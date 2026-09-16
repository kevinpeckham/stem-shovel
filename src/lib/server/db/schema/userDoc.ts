import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import { id, timestamps } from "./columns";
import { user } from "./user";

/**
 * A page of the user documentation (/docs/<slug>), readable by anyone and
 * edited by system admins with the song-document editor. Save semantics
 * match song documents: the hash gates a new row in user_doc_version and
 * the version number counts saves.
 */
export const userDoc = table(
	"user_doc",
	{
		id: id(),
		slug: t.text("slug").notNull().unique(),
		title: t.text("title").notNull(),
		/** Order in the index and the sidebar; ties by title. */
		sortOrder: t.integer("sort_order").notNull().default(0),
		markdown: t.text("markdown").notNull().default(""),
		contentHash: t.text("content_hash"),
		version: t.integer("version").notNull().default(0),
		updatedBy: t.text("updated_by").references(() => user.id, { onDelete: "set null" }),
		...timestamps,
	},
	(table) => [t.index("user_doc_updated_by_idx").on(table.updatedBy)],
);
