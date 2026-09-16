import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import type { ArchiveStatus } from "../../../val/ArchiveStatusSchema";
import type { SongChange } from "../../../val/SongChangeSchema";
import type { SongSection } from "../../../val/SongSectionSchema";
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
		/** Private: members only, or a share link; a private project makes its songs private too. */
		isPrivate: t.integer("is_private", { mode: "boolean" }).default(false).notNull(),
		/** No AI touches this song; a project's flag covers its songs too. */
		noAi: t.integer("no_ai", { mode: "boolean" }).default(false).notNull(),
		/** Done: listed under "Finished Songs" on the project page. Any member toggles it. */
		isFinished: t.integer("is_finished", { mode: "boolean" }).default(false).notNull(),
		/** Longest ready stem; refreshed whenever stems change. */
		durationSeconds: t.real("duration_seconds"),
		/** Optional free text shown under the title. */
		description: t.text("description").notNull().default(""),
		/** Who wrote it (free text) and when it was first written (ISO date, "YYYY-MM-DD"). */
		songwriter: t.text("songwriter").notNull().default(""),
		writtenOn: t.text("written_on"),
		// Three markdown documents per song, "chart" (chords, arrangement),
		// "lyrics" and "notes" (anything else), with the same save semantics: the hash gates a new row in
		// song_doc_version and the version number counts saves. 0 = never saved.
		chartMarkdown: t.text("chart_markdown").notNull().default(""),
		chartHash: t.text("chart_hash"),
		chartVersion: t.integer("chart_version").notNull().default(0),
		lyricsMarkdown: t.text("lyrics_markdown").notNull().default(""),
		lyricsHash: t.text("lyrics_hash"),
		lyricsVersion: t.integer("lyrics_version").notNull().default(0),
		notesMarkdown: t.text("notes_markdown").notNull().default(""),
		notesHash: t.text("notes_hash"),
		notesVersion: t.integer("notes_version").notNull().default(0),
		/**
		 * Tempo, key and time signature as timed changes: [{ kind, start, value }],
		 * start in seconds, sorted. A song's tempo is the "tempo" change at 0.
		 */
		changes: t.text("changes", { mode: "json" }).$type<SongChange[]>().notNull().default([]),
		/** User-managed semantic version of the song as a whole ("0.0.1"); never bumped automatically. */
		version: t.text("version").notNull().default("0.0.1"),
		/** When a stem was last added, replaced or removed. */
		stemsUpdatedAt: t.integer("stems_updated_at", { mode: "timestamp_ms" }),
		/** Frame rate for timecode display and entry (Logic's list; 25 by default). */
		frameRate: t.real("frame_rate").notNull().default(25),
		/** Where bar 1 begins (leading silence, a count-in) and where the song ends, in seconds; null = 0 / the last stem. */
		startAt: t.real("start_at"),
		endAt: t.real("end_at"),
		/** Song structure: [{ name, start }] with start in seconds, sorted; empty = no timeline. */
		sections: t.text("sections", { mode: "json" }).$type<SongSection[]>().notNull().default([]),
		/**
		 * Cached "original" MP3 mixdown (src/lib/server/mix.ts). `mixKey` names
		 * the set of stem files it was made from; a different set means re-render.
		 */
		mixUrl: t.text("mix_url"),
		mixKey: t.text("mix_key"),
		/** Set while a background render holds the song; stale after 15 minutes. */
		mixStartedAt: t.integer("mix_started_at", { mode: "timestamp_ms" }),
		/**
		 * Notes transcribed from the tonal stems by Basic Pitch on the server
		 * (src/lib/server/notes.ts), in segments: `notesJson` grows as
		 * `notesDoneSeconds` advances; `notesKey` names the stems it came from
		 * (mixKeyOf) once complete; `notesStartedAt` is the job's claim.
		 */
		notesJson: t
			.text("notes_json", { mode: "json" })
			.$type<import("../../../audio/chords").Note[]>(),
		notesKey: t.text("notes_key"),
		notesDoneSeconds: t.real("notes_done_seconds").default(0).notNull(),
		notesStartedAt: t.integer("notes_started_at", { mode: "timestamp_ms" }),
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
