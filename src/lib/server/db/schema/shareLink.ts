import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import { account } from "./account";
import { id, timestamps } from "./columns";
import { project } from "./project";
import { song } from "./song";
import { user } from "./user";

/**
 * A viewing code for a private song or project (exactly one of the two is
 * set; a project code opens every song in it). Any member makes one; the
 * link is the page's URL with `?share=<code>`, and the code is remembered
 * in a cookie for the rest of the visit. It grants viewing only.
 */
export const shareLink = table(
	"share_link",
	{
		id: id(),
		accountId: t
			.text("account_id")
			.notNull()
			.references(() => account.id, { onDelete: "cascade" }),
		projectId: t.text("project_id").references(() => project.id, { onDelete: "cascade" }),
		songId: t.text("song_id").references(() => song.id, { onDelete: "cascade" }),
		code: t.text("code").notNull().unique(),
		note: t.text("note").notNull().default(""),
		createdBy: t.text("created_by").references(() => user.id, { onDelete: "set null" }),
		/** null = never expires. */
		expiresAt: t.integer("expires_at", { mode: "timestamp_ms" }),
		/** null = unlimited; a use is a visitor's first arrival with the code. */
		maxUses: t.integer("max_uses"),
		uses: t.integer("uses").notNull().default(0),
		revokedAt: t.integer("revoked_at", { mode: "timestamp_ms" }),
		...timestamps,
	},
	(table) => [
		t.index("share_link_account_idx").on(table.accountId),
		t.index("share_link_project_idx").on(table.projectId),
		t.index("share_link_song_idx").on(table.songId),
		t.index("share_link_created_by_idx").on(table.createdBy),
	],
);
