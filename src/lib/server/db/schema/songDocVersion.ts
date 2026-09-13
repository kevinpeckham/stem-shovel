import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import type { SongDocKind } from "../../../val/SongDocKindSchema";
import { id, timestamps } from "./columns";
import { song } from "./song";
import { user } from "./user";

/**
 * One saved revision of a song document (chart, lyrics or notes). Only written
 * when the markdown's hash changes; the ten most recent per document are
 * kept (see data.saveSongDoc). Full text lives here: a document is a few KB.
 */
export const songDocVersion = table(
	"song_doc_version",
	{
		id: id(),
		songId: t
			.text("song_id")
			.notNull()
			.references(() => song.id, { onDelete: "cascade" }),
		kind: t.text("kind").$type<SongDocKind>().notNull(),
		versionNumber: t.integer("version_number").notNull(),
		markdown: t.text("markdown").notNull(),
		contentHash: t.text("content_hash").notNull(),
		createdBy: t.text("created_by").references(() => user.id, { onDelete: "set null" }),
		...timestamps,
	},
	(table) => [
		t.index("song_doc_version_song_idx").on(table.songId, table.kind, table.versionNumber),
	],
);
