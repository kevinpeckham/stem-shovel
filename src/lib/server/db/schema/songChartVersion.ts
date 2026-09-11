import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import { id, timestamps } from "./columns";
import { song } from "./song";
import { user } from "./user";

/**
 * One saved revision of a song's chart. Only written when the markdown's
 * hash changes; the ten most recent are kept (see data.saveChart). The full
 * text lives here rather than in Blob because a chart is a few kilobytes.
 */
export const songChartVersion = table(
	"song_chart_version",
	{
		id: id(),
		songId: t
			.text("song_id")
			.notNull()
			.references(() => song.id, { onDelete: "cascade" }),
		versionNumber: t.integer("version_number").notNull(),
		markdown: t.text("markdown").notNull(),
		contentHash: t.text("content_hash").notNull(),
		createdBy: t.text("created_by").references(() => user.id, { onDelete: "set null" }),
		...timestamps,
	},
	(table) => [t.index("song_chart_version_song_idx").on(table.songId, table.versionNumber)],
);
