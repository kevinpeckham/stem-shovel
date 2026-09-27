import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import type { DrumProject } from "../../../val/DrumPatternSchema";
import { account } from "./account";
import { id, timestamps } from "./columns";
import { song } from "./song";
import { user } from "./user";

/**
 * A saved beat from the drum machine (docs/drum-machine.md, Phase 3): a
 * name and the project as JSON (the share-link model, version inside), in
 * an account's library where every member sees it. It may belong to a
 * song ("the demo's beat"); the song going leaves the beat.
 */
export const beat = table(
	"beat",
	{
		id: id(),
		accountId: t
			.text("account_id")
			.notNull()
			.references(() => account.id, { onDelete: "cascade" }),
		createdBy: t.text("created_by").references(() => user.id, { onDelete: "set null" }),
		songId: t.text("song_id").references(() => song.id, { onDelete: "set null" }),
		name: t.text("name").notNull(),
		data: t.text("data", { mode: "json" }).$type<DrumProject>().notNull(),
		...timestamps,
	},
	(table) => [
		t.index("beat_account_idx").on(table.accountId),
		t.index("beat_created_by_idx").on(table.createdBy),
		t.index("beat_song_idx").on(table.songId),
	],
);
