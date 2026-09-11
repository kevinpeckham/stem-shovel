import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import { id, timestamps } from "./columns";
import { song } from "./song";
import { user } from "./user";

/** A revocable token granting read access to one song at `/s/<token>`. */
export const shareLink = table(
	"share_link",
	{
		id: id(),
		songId: t
			.text("song_id")
			.notNull()
			.references(() => song.id, { onDelete: "cascade" }),
		token: t.text("token").notNull().unique(),
		/** null = never expires. */
		expiresAt: t.integer("expires_at", { mode: "timestamp_ms" }),
		revokedAt: t.integer("revoked_at", { mode: "timestamp_ms" }),
		createdBy: t.text("created_by").references(() => user.id, { onDelete: "set null" }),
		...timestamps,
	},
	(table) => [t.index("share_link_song_idx").on(table.songId)],
);
