import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import { account } from "./account";
import { id, timestamps } from "./columns";
import { user } from "./user";

/**
 * A practice location (docs/band-plan.md, "Event"): where the band
 * rehearses, the account's own (unlike a show's venue, never shared),
 * saved once and picked again for each practice (`event.location_id`).
 * The name is unique per account, case-insensitively and trimmed, enforced
 * in code (src/lib/server/data.ts). Deleted with the account
 * (src/lib/server/cascade.ts).
 */
export const practiceLocation = table(
	"practice_location",
	{
		id: id(),
		accountId: t
			.text("account_id")
			.notNull()
			.references(() => account.id, { onDelete: "cascade" }),
		name: t.text("name").notNull(),
		address: t.text("address").notNull().default(""),
		/** The band's notes: the door code, where to park, who has the key. */
		notes: t.text("notes").notNull().default(""),
		createdBy: t.text("created_by").references(() => user.id, { onDelete: "set null" }),
		...timestamps,
	},
	(table) => [
		t.index("practice_location_account_idx").on(table.accountId),
		t.index("practice_location_account_name_idx").on(table.accountId, table.name),
		t.index("practice_location_created_by_idx").on(table.createdBy),
	],
);
