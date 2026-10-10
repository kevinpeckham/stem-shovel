import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import type { AmpPresetData } from "../../../val/AmpPresetSchema";
import type { AmpInstrument } from "../../../val/AmpSchema";
import { account } from "./account";
import { id, timestamps } from "./columns";
import { user } from "./user";

/**
 * A saved Practice Amp preset (docs/practice-amp.md, "Presets"): a name,
 * the instrument it is for and the rig as JSON, in an account's library
 * where every member sees it (migration 0085). Each instrument has six
 * slot buttons, so a preset carries an optional slot for its own
 * instrument; at most one preset of an account per instrument and slot,
 * kept by the data layer.
 */
export const ampPreset = table(
	"amp_preset",
	{
		id: id(),
		accountId: t
			.text("account_id")
			.notNull()
			.references(() => account.id, { onDelete: "cascade" }),
		createdBy: t.text("created_by").references(() => user.id, { onDelete: "set null" }),
		name: t.text("name").notNull(),
		instrument: t.text("instrument").$type<AmpInstrument>().notNull(),
		slot: t.integer("slot"),
		data: t.text("data", { mode: "json" }).$type<AmpPresetData>().notNull(),
		...timestamps,
	},
	(table) => [
		t.index("amp_preset_account_idx").on(table.accountId),
		t.index("amp_preset_created_by_idx").on(table.createdBy),
	],
);
