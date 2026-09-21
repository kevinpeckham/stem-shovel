import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import { id, timestamps } from "./columns";
import { user } from "./user";
import type { UserDocKind } from "../../../val/UserDocKindSchema";

/**
 * A page of the user documentation (/docs/<slug>) or, with kind "post", a
 * blog post (/blog/<slug>, public once published), readable by anyone and
 * edited by system admins with the song-document editor. Save semantics
 * match song documents: the hash gates a new row in user_doc_version and
 * the version number counts saves.
 */
export const userDoc = table(
	"user_doc",
	{
		id: id(),
		slug: t.text("slug").notNull().unique(),
		kind: t.text("kind").$type<UserDocKind>().notNull().default("doc"),
		title: t.text("title").notNull(),
		/** Order in the index and the sidebar; ties by title. */
		sortOrder: t.integer("sort_order").notNull().default(0),
		markdown: t.text("markdown").notNull().default(""),
		/** Posts only: null is a draft that only system admins see. */
		publishedAt: t.integer("published_at", { mode: "timestamp_ms" }),
		contentHash: t.text("content_hash"),
		version: t.integer("version").notNull().default(0),
		updatedBy: t.text("updated_by").references(() => user.id, { onDelete: "set null" }),
		...timestamps,
	},
	(table) => [t.index("user_doc_updated_by_idx").on(table.updatedBy)],
);
