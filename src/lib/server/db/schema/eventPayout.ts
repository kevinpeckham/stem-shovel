import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import { account } from "./account";
import { id, timestamps } from "./columns";
import { event } from "./event";
import { user } from "./user";

/**
 * One payout of a show (docs/band-plan.md, "The books"): who was paid out
 * of the night's take and how much, in cents. `userId` is the member paid
 * when it is one (null for a hired player or a label like "Gas"); `name`
 * names the payee when it is not a member. Ordered by `sortOrder`. Goes
 * with its event (src/lib/server/cascade.ts).
 */
export const eventPayout = table(
	"event_payout",
	{
		id: id(),
		accountId: t
			.text("account_id")
			.notNull()
			.references(() => account.id, { onDelete: "cascade" }),
		eventId: t
			.text("event_id")
			.notNull()
			.references(() => event.id, { onDelete: "cascade" }),
		/** The member paid, when it is one; null otherwise. */
		userId: t.text("user_id").references(() => user.id, { onDelete: "set null" }),
		/** Who, when not a member (or as a label). */
		name: t.text("name").notNull().default(""),
		amountCents: t.integer("amount_cents").notNull(),
		note: t.text("note").notNull().default(""),
		sortOrder: t.integer("sort_order").notNull().default(0),
		...timestamps,
	},
	(table) => [
		t.index("event_payout_account_idx").on(table.accountId),
		t.index("event_payout_event_idx").on(table.eventId),
		t.index("event_payout_user_idx").on(table.userId),
	],
);
