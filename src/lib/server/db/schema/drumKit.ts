import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import { account } from "./account";
import { id, timestamps } from "./columns";
import { user } from "./user";

/**
 * A custom drum kit (docs/drum-machine.md, "Custom kits"): a name over a set
 * of one-shot samples (`drum_sample`, one per voice). With an account it is
 * the account's, made and kept by its editors and played by its members;
 * without one it is the site's, a system admin's, and plays for everyone.
 */
export const drumKit = table(
	"drum_kit",
	{
		id: id(),
		/** Null: a site kit. */
		accountId: t.text("account_id").references(() => account.id, { onDelete: "cascade" }),
		createdBy: t.text("created_by").references(() => user.id, { onDelete: "set null" }),
		name: t.text("name").notNull(),
		/** A multisampled kit: up to 5 velocity layers × 6 round robins per voice, a sample replaced only in its own slot. A single-sample kit keeps one file per voice. */
		multisampled: t.integer("multisampled", { mode: "boolean" }).notNull().default(false),
		...timestamps,
	},
	(table) => [
		t.index("drum_kit_account_idx").on(table.accountId),
		t.index("drum_kit_created_by_idx").on(table.createdBy),
	],
);
