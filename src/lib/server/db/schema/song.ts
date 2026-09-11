import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import type { ArchiveStatus } from "../../../val/ArchiveStatusSchema";
import { account } from "./account";
import { id, timestamps } from "./columns";
import { project } from "./project";
import { user } from "./user";

export const song = table(
	"song",
	{
		id: id(),
		/** Denormalized from project so tenant scoping never needs a join. */
		accountId: t
			.text("account_id")
			.notNull()
			.references(() => account.id, { onDelete: "cascade" }),
		projectId: t
			.text("project_id")
			.notNull()
			.references(() => project.id, { onDelete: "cascade" }),
		title: t.text("title").notNull(),
		slug: t.text("slug").notNull(),
		bpm: t.real("bpm"),
		/** "D", "F#m" — free text for now. */
		musicalKey: t.text("musical_key"),
		/** Longest ready stem; refreshed whenever stems change. */
		durationSeconds: t.real("duration_seconds"),
		notes: t.text("notes").notNull().default(""),
		/** Chords, lyrics and arrangement as markdown. History in song_chart_version. */
		chartMarkdown: t.text("chart_markdown").notNull().default(""),
		/** SHA-256 of chartMarkdown; a save only creates a version when it changes. */
		chartHash: t.text("chart_hash"),
		/** Sequential number of the current chart version; 0 = never saved. */
		chartVersion: t.integer("chart_version").notNull().default(0),
		status: t.text("status").$type<ArchiveStatus>().notNull().default("active"),
		sortOrder: t.integer("sort_order").notNull().default(0),
		createdBy: t.text("created_by").references(() => user.id, { onDelete: "set null" }),
		...timestamps,
	},
	(table) => [
		t.index("song_account_idx").on(table.accountId),
		t.index("song_project_idx").on(table.projectId),
		t.unique("song_slug_unique").on(table.projectId, table.slug),
	],
);
