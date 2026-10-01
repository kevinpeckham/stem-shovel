import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import type { PianoPresetData } from "../../../val/PianoPresetSchema";
import { account } from "./account";
import { id, timestamps } from "./columns";
import { user } from "./user";

/**
 * A saved piano preset (docs/piano.md, "Presets"): a name, the sound and
 * effects as JSON, in an account's library where every member sees it, and
 * a slot (1 to 5) when it sits on one of the piano's preset buttons; at
 * most one preset of an account per slot, kept by the data layer.
 */
export const pianoPreset = table(
	"piano_preset",
	{
		id: id(),
		accountId: t
			.text("account_id")
			.notNull()
			.references(() => account.id, { onDelete: "cascade" }),
		createdBy: t.text("created_by").references(() => user.id, { onDelete: "set null" }),
		name: t.text("name").notNull(),
		slot: t.integer("slot"),
		data: t.text("data", { mode: "json" }).$type<PianoPresetData>().notNull(),
		...timestamps,
	},
	(table) => [
		t.index("piano_preset_account_idx").on(table.accountId),
		t.index("piano_preset_created_by_idx").on(table.createdBy),
	],
);
