import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import type { StudioArrangement } from "../../../val/StudioSchema";
import { account } from "./account";
import { id, timestamps } from "./columns";
import { idea } from "./idea";
import { user } from "./user";

/**
 * A snapshot of a Studio song's arrangement (docs/multitrack-recorder.md,
 * "Data model"), numbered 1, 2, 3… within its idea. An unnamed row is an
 * autosave (the newest STUDIO_AUTOSAVES_KEPT are kept, as song_doc_version
 * keeps a chart's); a named one is kept for good. The current arrangement
 * is the newest row by number, named or not; a restore writes an old
 * row's data forward as a new autosave, so history is never rewritten.
 */
export const studioRevision = table(
	"studio_revision",
	{
		id: id(),
		accountId: t
			.text("account_id")
			.notNull()
			.references(() => account.id, { onDelete: "cascade" }),
		ideaId: t
			.text("idea_id")
			.notNull()
			.references(() => idea.id, { onDelete: "cascade" }),
		savedBy: t.text("saved_by").references(() => user.id, { onDelete: "set null" }),
		/** null = an autosave; a name makes it a kept revision. */
		name: t.text("name"),
		number: t.integer("number").notNull(),
		/** The arrangement (StudioArrangementSchema). */
		data: t.text("data", { mode: "json" }).$type<StudioArrangement>().notNull(),
		/** arrangementHash of the data, so an unchanged autosave writes nothing. */
		hash: t.text("hash").notNull(),
		...timestamps,
	},
	(table) => [
		t.index("studio_revision_account_idx").on(table.accountId),
		t.index("studio_revision_idea_number_idx").on(table.ideaId, table.number),
		t.index("studio_revision_saved_by_idx").on(table.savedBy),
	],
);
