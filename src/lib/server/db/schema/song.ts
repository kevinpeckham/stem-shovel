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
		/** Optional free text shown under the title. */
		description: t.text("description").notNull().default(""),
		// Two markdown documents per song, "chart" (chords, arrangement) and
		// "lyrics", with the same save semantics: the hash gates a new row in
		// song_doc_version and the version number counts saves. 0 = never saved.
		chartMarkdown: t.text("chart_markdown").notNull().default(""),
		chartHash: t.text("chart_hash"),
		chartVersion: t.integer("chart_version").notNull().default(0),
		lyricsMarkdown: t.text("lyrics_markdown").notNull().default(""),
		lyricsHash: t.text("lyrics_hash"),
		lyricsVersion: t.integer("lyrics_version").notNull().default(0),
		/**
		 * Cached "original" MP3 mixdown (src/lib/server/mix.ts). `mixKey` names
		 * the set of stem files it was made from; a different set means re-render.
		 */
		mixUrl: t.text("mix_url"),
		mixKey: t.text("mix_key"),
		/** Set while a background render holds the song; stale after 15 minutes. */
		mixStartedAt: t.integer("mix_started_at", { mode: "timestamp_ms" }),
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
