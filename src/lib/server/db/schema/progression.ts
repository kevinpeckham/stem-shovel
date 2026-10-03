import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import type { ProgressionData } from "../../../val/ProgressionSchema";
import { account } from "./account";
import { id, timestamps } from "./columns";
import { user } from "./user";

/**
 * A saved chord progression from the chord player's pad (docs/chord-player.md,
 * "The progression pad"): a name and the pad's data as JSON (tempo, time
 * signature, the chords and rests with their beats), in an account's
 * library where every member sees it and its editors keep it, as a beat.
 */
export const progression = table(
	"progression",
	{
		id: id(),
		accountId: t
			.text("account_id")
			.notNull()
			.references(() => account.id, { onDelete: "cascade" }),
		createdBy: t.text("created_by").references(() => user.id, { onDelete: "set null" }),
		name: t.text("name").notNull(),
		data: t.text("data", { mode: "json" }).$type<ProgressionData>().notNull(),
		...timestamps,
	},
	(table) => [
		t.index("progression_account_idx").on(table.accountId),
		t.index("progression_created_by_idx").on(table.createdBy),
	],
);
