import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import { account } from "./account";
import { id, timestamps } from "./columns";
import { venue } from "./venue";

/**
 * A venue on an account's list (docs/band-plan.md, "Event"), with what is
 * the band's own about it: its notes (parking, the back door, the house
 * engineer) and its contact there. One row per account and venue. Deleted
 * with the account (src/lib/server/cascade.ts).
 */
export const accountVenue = table(
	"account_venue",
	{
		id: id(),
		accountId: t
			.text("account_id")
			.notNull()
			.references(() => account.id, { onDelete: "cascade" }),
		venueId: t
			.text("venue_id")
			.notNull()
			.references(() => venue.id, { onDelete: "cascade" }),
		notes: t.text("notes").notNull().default(""),
		/** The band's contact at the venue: a name, phone, email, free text. */
		contact: t.text("contact").notNull().default(""),
		...timestamps,
	},
	(table) => [
		t.uniqueIndex("account_venue_unique").on(table.accountId, table.venueId),
		t.index("account_venue_account_idx").on(table.accountId),
		t.index("account_venue_venue_idx").on(table.venueId),
	],
);
