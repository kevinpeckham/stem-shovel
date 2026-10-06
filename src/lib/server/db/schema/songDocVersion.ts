import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import type { SongDocSaveKind } from "../../../val/SongDocKindSchema";
import { id, timestamps } from "./columns";
import { song } from "./song";
import { user } from "./user";

/**
 * One saved revision of a song document: the shared chart, lyrics or notes
 * (`user_id` null), or one person's private note (`kind` "mynotes" with the
 * owner's `user_id`; song_user_note holds the current text). Only written
 * when the markdown's hash changes; the ten most recent per document — per
 * (song, kind), or per (song, user) for a private note — are kept (see
 * data.saveSongDoc / saveUserNote). Full text lives here: a document is a
 * few KB. Read back through history.remote.ts, where a private note's
 * revisions answer only to their owner.
 */
export const songDocVersion = table(
	"song_doc_version",
	{
		id: id(),
		songId: t
			.text("song_id")
			.notNull()
			.references(() => song.id, { onDelete: "cascade" }),
		kind: t.text("kind").$type<SongDocSaveKind>().notNull(),
		/** The owner of a "mynotes" revision; null for the shared documents. */
		userId: t.text("user_id").references(() => user.id, { onDelete: "set null" }),
		versionNumber: t.integer("version_number").notNull(),
		markdown: t.text("markdown").notNull(),
		contentHash: t.text("content_hash").notNull(),
		createdBy: t.text("created_by").references(() => user.id, { onDelete: "set null" }),
		...timestamps,
	},
	(table) => [
		t.index("song_doc_version_song_idx").on(table.songId, table.kind, table.versionNumber),
		t.index("song_doc_version_user_idx").on(table.userId),
	],
);
