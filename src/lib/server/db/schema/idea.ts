import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import type { IdeaKind } from "../../../val/IdeaSchema";
import { account } from "./account";
import { id, timestamps } from "./columns";
import { user } from "./user";

/**
 * An idea from the Idea Recorder (docs/demo-recording.md): a title, one
 * note board, and one or more takes (`recording` rows). Ideas live in the
 * account's library; a take added to a song becomes a demo of that song.
 */
export const idea = table(
	"idea",
	{
		id: id(),
		accountId: t
			.text("account_id")
			.notNull()
			.references(() => account.id, { onDelete: "cascade" }),
		createdBy: t.text("created_by").references(() => user.id, { onDelete: "set null" }),
		title: t.text("title").notNull(),
		/** "idea": recorded in the Idea Recorder, listed there; "loop": saved from the looper, listed in the looper and in the recorder only when asked for (docs/looper.md, "Save and Export"). */
		kind: t.text("kind").$type<IdeaKind>().notNull().default("idea"),
		/** Markdown notes on the idea: chords, lyrics, where it might go. */
		notes: t.text("notes").notNull().default(""),
		/** The drum machine's project and the piano's sound and effects as they were with this idea (JSON, `IdeaInstrumentsDataSchema`), saved as they change and loaded back with the idea; null before any were saved. */
		instruments: t.text("instruments"),
		...timestamps,
	},
	(table) => [
		t.index("idea_account_idx").on(table.accountId),
		t.index("idea_created_by_idx").on(table.createdBy),
	],
);
