import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import { id, timestamps } from "./columns";
import { setList } from "./setList";
import { song } from "./song";

/**
 * One row of a set list (docs/band-plan.md, phase 1): a song from the
 * catalog (`songId`, so the show view can open its chart and lyrics) or
 * free text (a cover not in Stem Shovel, "break", "encore"), with a note
 * for the night (the key, who counts in, a segue). `title` is always
 * filled: the song's title when it was added, which is what the row says
 * once the song is gone (the song's deletion clears `songId` and keeps
 * the row; src/lib/server/cascade.ts). Ordered by `sortOrder`.
 */
export const setListItem = table(
	"set_list_item",
	{
		id: id(),
		setListId: t
			.text("set_list_id")
			.notNull()
			.references(() => setList.id, { onDelete: "cascade" }),
		songId: t.text("song_id").references(() => song.id, { onDelete: "set null" }),
		title: t.text("title").notNull().default(""),
		note: t.text("note").notNull().default(""),
		sortOrder: t.integer("sort_order").notNull().default(0),
		...timestamps,
	},
	(table) => [
		t.index("set_list_item_set_list_idx").on(table.setListId),
		t.index("set_list_item_song_idx").on(table.songId),
	],
);
