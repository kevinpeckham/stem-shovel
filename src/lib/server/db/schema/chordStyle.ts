import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import type { ChordStyleData } from "../../../val/ChordStyleSchema";
import { account } from "./account";
import { id, timestamps } from "./columns";
import { user } from "./user";

/**
 * A custom chord style from the chord player (docs/chord-player.md,
 * "Styles"): a name and, per degree and ring, the chord recipe a wedge
 * carries and what the 7 pad raises it to, as JSON, in an account's
 * library where every member plays it and its editors keep it.
 */
export const chordStyle = table(
	"chord_style",
	{
		id: id(),
		accountId: t
			.text("account_id")
			.notNull()
			.references(() => account.id, { onDelete: "cascade" }),
		createdBy: t.text("created_by").references(() => user.id, { onDelete: "set null" }),
		name: t.text("name").notNull(),
		data: t.text("data", { mode: "json" }).$type<ChordStyleData>().notNull(),
		...timestamps,
	},
	(table) => [
		t.index("chord_style_account_idx").on(table.accountId),
		t.index("chord_style_created_by_idx").on(table.createdBy),
	],
);
