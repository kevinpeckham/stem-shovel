import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import type { ArchiveStatus } from "../../../val/ArchiveStatusSchema";
import { account } from "./account";
import { id, timestamps } from "./columns";
import { user } from "./user";

/** A group of songs inside an account: an album, a session, a client job. */
export const project = table(
	"project",
	{
		id: id(),
		accountId: t
			.text("account_id")
			.notNull()
			.references(() => account.id, { onDelete: "cascade" }),
		name: t.text("name").notNull(),
		slug: t.text("slug").notNull(),
		/** Private: members only, or a share link (docs/auth.md); every song inside inherits it. */
		isPrivate: t.integer("is_private", { mode: "boolean" }).default(false).notNull(),
		/** No AI touches this project's songs (docs/security.md): no model calls, no transcription. */
		noAi: t.integer("no_ai", { mode: "boolean" }).default(false).notNull(),
		description: t.text("description").notNull().default(""),
		status: t.text("status").$type<ArchiveStatus>().notNull().default("active"),
		archivedAt: t.integer("archived_at", { mode: "timestamp_ms" }),
		/** Manual ordering inside the account (lower first). */
		sortOrder: t.integer("sort_order").notNull().default(0),
		createdBy: t.text("created_by").references(() => user.id, { onDelete: "set null" }),
		...timestamps,
	},
	(table) => [
		t.index("project_account_idx").on(table.accountId),
		t.unique("project_slug_unique").on(table.accountId, table.slug),
	],
);
