import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import { account } from "./account";
import { id, timestamps } from "./columns";
import { user } from "./user";

/**
 * A contact (docs/band-plan.md, "The band directory"): a promoter, a
 * booking agent, a sound engineer, the account's own and never shared,
 * saved once and picked again as a show's promoter
 * (`event.promoter_contact_id`). Names need not be unique: two Sams are
 * fine. Deleted with the account (src/lib/server/cascade.ts).
 */
export const contact = table(
	"contact",
	{
		id: id(),
		accountId: t
			.text("account_id")
			.notNull()
			.references(() => account.id, { onDelete: "cascade" }),
		name: t.text("name").notNull(),
		createdBy: t.text("created_by").references(() => user.id, { onDelete: "set null" }),
		/** What they do for the band, as free text ("Promoter", "Booking agent"). */
		role: t.text("role").notNull().default(""),
		phone: t.text("phone").notNull().default(""),
		email: t.text("email").notNull().default(""),
		address: t.text("address").notNull().default(""),
		/** The band's notes: how they like to be reached, what they paid last time. */
		notes: t.text("notes").notNull().default(""),
		...timestamps,
	},
	(table) => [
		t.index("contact_created_by_idx").on(table.createdBy),
		t.index("contact_account_idx").on(table.accountId),
	],
);
